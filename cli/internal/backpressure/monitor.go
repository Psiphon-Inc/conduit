/*
 * Copyright (c) 2026, Psiphon Inc.
 * All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

// Package backpressure provides runtime monitoring for system load.
//
// CURRENT LIMITATIONS:
// This package provides monitoring and alerting only. It cannot actively
// reject incoming connections because psiphon-tunnel-core does not expose
// an API to dynamically control client acceptance.
//
// The ShouldAcceptClient() method returns the current recommendation, but
// the calling code must implement the actual rejection logic if possible.
//
// Primary use cases:
//   - Monitoring system load (CPU estimate, memory, goroutines)
//   - Logging warnings when system is overloaded
//   - Providing load stats for external monitoring/dashboards
//
// For actual client limiting, use the --max-clients flag with --adaptive
// to set hardware-appropriate limits at startup.
package backpressure

import (
	"context"
	"fmt"
	"runtime"
	"sync"
	"time"
)

// Default thresholds for back-pressure
const (
	DefaultCPUThreshold      = 80.0 // Log warning if CPU > 80%
	DefaultCheckInterval     = 5 * time.Second
	DefaultSampleWindow      = 30 * time.Second
	DefaultCooldownPeriod    = 10 * time.Second
	DefaultMemoryThreshold   = 90.0 // Reject if memory > 90%
	DefaultGoroutineLimit    = 10000
)

// LoadStats represents current system load metrics
type LoadStats struct {
	CPUPercent       float64   // Current CPU usage percentage (0-100)
	MemoryPercent    float64   // Current memory usage percentage (0-100)
	GoroutineCount   int       // Number of active goroutines
	IsOverloaded     bool      // True if any threshold exceeded
	LastCheck        time.Time // Time of last measurement
	RejectingClients bool      // True if currently rejecting new clients
	RejectReason     string    // Reason for rejection (if any)
}

// OverloadCallback is called when overload state changes
type OverloadCallback func(overloaded bool, stats LoadStats)

// MonitorConfig holds configuration for the back-pressure monitor
type MonitorConfig struct {
	CPUThreshold    float64       // CPU percentage threshold (default: 80%)
	MemoryThreshold float64       // Memory percentage threshold (default: 90%)
	GoroutineLimit  int           // Max goroutines before rejection (default: 10000)
	CheckInterval   time.Duration // How often to check metrics (default: 5s)
	CooldownPeriod  time.Duration // How long to wait after overload before accepting (default: 10s)
	Verbosity       int           // Logging verbosity level
	OnOverload      OverloadCallback // Optional callback when overload state changes
}

// Monitor tracks system metrics and decides whether to accept new clients
type Monitor struct {
	config MonitorConfig

	mu              sync.RWMutex
	currentStats    LoadStats
	overloadedSince time.Time
	running         bool

	// Channels for coordination
	stopCh chan struct{}
	doneCh chan struct{}
}

// NewMonitor creates a new back-pressure monitor with the given configuration
func NewMonitor(cfg MonitorConfig) *Monitor {
	// Apply defaults
	if cfg.CPUThreshold <= 0 {
		cfg.CPUThreshold = DefaultCPUThreshold
	}
	if cfg.MemoryThreshold <= 0 {
		cfg.MemoryThreshold = DefaultMemoryThreshold
	}
	if cfg.GoroutineLimit <= 0 {
		cfg.GoroutineLimit = DefaultGoroutineLimit
	}
	if cfg.CheckInterval <= 0 {
		cfg.CheckInterval = DefaultCheckInterval
	}
	if cfg.CooldownPeriod <= 0 {
		cfg.CooldownPeriod = DefaultCooldownPeriod
	}

	return &Monitor{
		config: cfg,
		currentStats: LoadStats{
			LastCheck: time.Now(),
		},
		stopCh: make(chan struct{}),
		doneCh: make(chan struct{}),
	}
}

// Start begins monitoring system metrics in the background
// Safe to call multiple times - will reset channels if previously stopped
func (m *Monitor) Start(ctx context.Context) {
	m.mu.Lock()
	if m.running {
		m.mu.Unlock()
		return
	}

	// Reset channels for reuse (in case Stop was called before)
	m.stopCh = make(chan struct{})
	m.doneCh = make(chan struct{})
	m.running = true
	m.mu.Unlock()

	go m.monitorLoop(ctx)
}

// Stop stops the monitoring goroutine
// Safe to call multiple times
func (m *Monitor) Stop() {
	m.mu.Lock()
	if !m.running {
		m.mu.Unlock()
		return
	}
	m.running = false
	stopCh := m.stopCh
	doneCh := m.doneCh
	m.mu.Unlock()

	close(stopCh)
	<-doneCh
}

// monitorLoop is the main monitoring loop
func (m *Monitor) monitorLoop(ctx context.Context) {
	defer close(m.doneCh)

	ticker := time.NewTicker(m.config.CheckInterval)
	defer ticker.Stop()

	// Initial check
	m.updateStats()

	for {
		select {
		case <-ctx.Done():
			return
		case <-m.stopCh:
			return
		case <-ticker.C:
			m.updateStats()
		}
	}
}

// updateStats collects current system metrics
func (m *Monitor) updateStats() {
	stats := LoadStats{
		LastCheck:      time.Now(),
		GoroutineCount: runtime.NumGoroutine(),
	}

	// Get memory stats
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	// Calculate memory percentage (heap in use vs total system memory)
	// This is an approximation since Go doesn't expose total system memory directly
	// We use HeapInuse vs HeapSys as a proxy
	if memStats.HeapSys > 0 {
		stats.MemoryPercent = float64(memStats.HeapInuse) / float64(memStats.HeapSys) * 100
	}

	// CPU measurement using goroutine scheduling latency as a proxy
	// A more accurate measurement would require cgo or external packages
	// For now, we use goroutine count as an indicator of load
	stats.CPUPercent = m.estimateCPULoad(stats.GoroutineCount)

	// Check thresholds
	var rejectReasons []string

	if stats.CPUPercent >= m.config.CPUThreshold {
		rejectReasons = append(rejectReasons,
			fmt.Sprintf("CPU load high (%.1f%% >= %.1f%%)", stats.CPUPercent, m.config.CPUThreshold))
	}

	if stats.MemoryPercent >= m.config.MemoryThreshold {
		rejectReasons = append(rejectReasons,
			fmt.Sprintf("Memory high (%.1f%% >= %.1f%%)", stats.MemoryPercent, m.config.MemoryThreshold))
	}

	if stats.GoroutineCount >= m.config.GoroutineLimit {
		rejectReasons = append(rejectReasons,
			fmt.Sprintf("Goroutines high (%d >= %d)", stats.GoroutineCount, m.config.GoroutineLimit))
	}

	stats.IsOverloaded = len(rejectReasons) > 0

	if stats.IsOverloaded {
		stats.RejectReason = rejectReasons[0] // Primary reason
	}

	// Update stored stats
	m.mu.Lock()
	defer m.mu.Unlock()

	prevOverloaded := m.currentStats.IsOverloaded
	m.currentStats = stats

	// Track when overload started and notify via callback
	stateChanged := false
	if stats.IsOverloaded && !prevOverloaded {
		m.overloadedSince = time.Now()
		stateChanged = true
		if m.config.Verbosity >= 1 {
			fmt.Printf("[BACKPRESSURE] Overload detected: %s\n", stats.RejectReason)
		}
	} else if !stats.IsOverloaded && prevOverloaded {
		stateChanged = true
		if m.config.Verbosity >= 1 {
			fmt.Println("[BACKPRESSURE] System load normalized")
		}
	}

	// Call callback if state changed (outside lock to prevent deadlock)
	callback := m.config.OnOverload
	if stateChanged && callback != nil {
		// Make a copy of stats for callback
		statsCopy := stats
		go callback(stats.IsOverloaded, statsCopy)
	}

	// Determine if we should reject clients (with cooldown)
	if stats.IsOverloaded {
		stats.RejectingClients = true
	} else if !m.overloadedSince.IsZero() {
		// Apply cooldown period after overload ends
		if time.Since(m.overloadedSince) < m.config.CooldownPeriod {
			stats.RejectingClients = true
			stats.RejectReason = "cooldown period after overload"
		} else {
			m.overloadedSince = time.Time{}
		}
	}

	m.currentStats = stats
}

// estimateCPULoad estimates CPU load based on goroutine count.
//
// IMPORTANT: This is a rough heuristic, NOT actual CPU measurement.
// Accurate CPU measurement requires cgo (e.g., gopsutil) which adds
// complexity and cross-compilation issues.
//
// Limitations:
//   - CPU-bound code with few goroutines will show LOW load (false negative)
//   - IO-heavy code with many goroutines will show HIGH load (false positive)
//
// For reliable overload detection, prefer GoroutineLimit threshold which
// is accurate and directly measurable.
func (m *Monitor) estimateCPULoad(goroutineCount int) float64 {
	numCPU := runtime.NumCPU()

	// Heuristic: goroutine-to-CPU ratio as proxy for load
	// This works reasonably for network-heavy workloads like proxy servers
	ratio := float64(goroutineCount) / float64(numCPU)

	// Map ratio to percentage (rough estimate)
	switch {
	case ratio < 10:
		return ratio * 5 // 0-50%
	case ratio < 50:
		return 50 + (ratio-10)*1 // 50-90%
	case ratio < 100:
		return 90 + (ratio-50)*0.1 // 90-95%
	default:
		return 95 + (ratio-100)*0.01 // 95%+
	}
}

// ShouldAcceptClient returns true if a new client should be accepted
func (m *Monitor) ShouldAcceptClient() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return !m.currentStats.RejectingClients
}

// GetCurrentLoad returns the current system load statistics
func (m *Monitor) GetCurrentLoad() LoadStats {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.currentStats
}

// GetRejectReason returns the current rejection reason (empty if accepting)
func (m *Monitor) GetRejectReason() string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.currentStats.RejectingClients {
		return m.currentStats.RejectReason
	}
	return ""
}

// String returns a human-readable status summary
func (m *Monitor) String() string {
	stats := m.GetCurrentLoad()
	status := "accepting"
	if stats.RejectingClients {
		status = "rejecting"
	}
	return fmt.Sprintf("BackPressure: %s (CPU: %.1f%%, Mem: %.1f%%, Goroutines: %d)",
		status, stats.CPUPercent, stats.MemoryPercent, stats.GoroutineCount)
}

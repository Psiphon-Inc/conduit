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

package backpressure

import (
	"context"
	"testing"
	"time"
)

func TestNewMonitor(t *testing.T) {
	// Test with defaults
	m := NewMonitor(MonitorConfig{})

	if m.config.CPUThreshold != DefaultCPUThreshold {
		t.Errorf("CPUThreshold: got %.1f, expected %.1f", m.config.CPUThreshold, DefaultCPUThreshold)
	}

	if m.config.MemoryThreshold != DefaultMemoryThreshold {
		t.Errorf("MemoryThreshold: got %.1f, expected %.1f", m.config.MemoryThreshold, DefaultMemoryThreshold)
	}

	if m.config.GoroutineLimit != DefaultGoroutineLimit {
		t.Errorf("GoroutineLimit: got %d, expected %d", m.config.GoroutineLimit, DefaultGoroutineLimit)
	}

	if m.config.CheckInterval != DefaultCheckInterval {
		t.Errorf("CheckInterval: got %v, expected %v", m.config.CheckInterval, DefaultCheckInterval)
	}

	// Test with custom values
	m2 := NewMonitor(MonitorConfig{
		CPUThreshold:    50.0,
		MemoryThreshold: 70.0,
		GoroutineLimit:  5000,
		CheckInterval:   1 * time.Second,
	})

	if m2.config.CPUThreshold != 50.0 {
		t.Errorf("Custom CPUThreshold: got %.1f, expected 50.0", m2.config.CPUThreshold)
	}

	if m2.config.MemoryThreshold != 70.0 {
		t.Errorf("Custom MemoryThreshold: got %.1f, expected 70.0", m2.config.MemoryThreshold)
	}
}

func TestMonitorStartStop(t *testing.T) {
	m := NewMonitor(MonitorConfig{
		CheckInterval: 100 * time.Millisecond,
	})

	ctx, cancel := context.WithCancel(context.Background())

	// Start the monitor
	m.Start(ctx)

	// Give it time to run at least once
	time.Sleep(150 * time.Millisecond)

	// Check that stats were updated
	stats := m.GetCurrentLoad()
	if stats.LastCheck.IsZero() {
		t.Error("LastCheck should be set after start")
	}

	// Stop via context cancellation
	cancel()
	time.Sleep(50 * time.Millisecond)

	// Verify we can start again
	ctx2 := context.Background()
	m2 := NewMonitor(MonitorConfig{
		CheckInterval: 100 * time.Millisecond,
	})
	m2.Start(ctx2)
	time.Sleep(50 * time.Millisecond)
	m2.Stop()
}

func TestShouldAcceptClient(t *testing.T) {
	m := NewMonitor(MonitorConfig{
		CheckInterval: 100 * time.Millisecond,
	})

	// Before start, should accept
	if !m.ShouldAcceptClient() {
		t.Error("Should accept clients initially")
	}

	ctx := context.Background()
	m.Start(ctx)
	defer m.Stop()

	// Give it time to run
	time.Sleep(150 * time.Millisecond)

	// Under normal conditions (in test environment), should accept
	// This may vary based on actual system load
	stats := m.GetCurrentLoad()
	if stats.RejectingClients && !stats.IsOverloaded {
		t.Error("Should not reject clients when not overloaded")
	}
}

func TestGetCurrentLoad(t *testing.T) {
	m := NewMonitor(MonitorConfig{
		CheckInterval: 100 * time.Millisecond,
	})

	ctx := context.Background()
	m.Start(ctx)
	defer m.Stop()

	time.Sleep(150 * time.Millisecond)

	stats := m.GetCurrentLoad()

	// Basic sanity checks
	if stats.GoroutineCount < 1 {
		t.Error("GoroutineCount should be at least 1")
	}

	// Memory percent should be between 0 and 100
	if stats.MemoryPercent < 0 || stats.MemoryPercent > 100 {
		t.Errorf("MemoryPercent out of range: %.1f", stats.MemoryPercent)
	}

	// CPU percent should be non-negative
	if stats.CPUPercent < 0 {
		t.Errorf("CPUPercent should not be negative: %.1f", stats.CPUPercent)
	}
}

func TestGetRejectReason(t *testing.T) {
	m := NewMonitor(MonitorConfig{
		CheckInterval: 100 * time.Millisecond,
	})

	ctx := context.Background()
	m.Start(ctx)
	defer m.Stop()

	time.Sleep(150 * time.Millisecond)

	reason := m.GetRejectReason()
	stats := m.GetCurrentLoad()

	// If not rejecting, reason should be empty
	if !stats.RejectingClients && reason != "" {
		t.Error("Reason should be empty when not rejecting")
	}

	// If rejecting, reason should not be empty
	if stats.RejectingClients && reason == "" {
		t.Error("Reason should not be empty when rejecting")
	}
}

func TestMonitorString(t *testing.T) {
	m := NewMonitor(MonitorConfig{
		CheckInterval: 100 * time.Millisecond,
	})

	ctx := context.Background()
	m.Start(ctx)
	defer m.Stop()

	time.Sleep(150 * time.Millisecond)

	str := m.String()
	if str == "" {
		t.Error("String() should not return empty string")
	}

	// Should contain "BackPressure"
	if !contains(str, "BackPressure") {
		t.Errorf("String() should contain 'BackPressure': %s", str)
	}
}

func TestEstimateCPULoad(t *testing.T) {
	m := NewMonitor(MonitorConfig{})

	// Test that more goroutines = higher load estimate
	load5 := m.estimateCPULoad(5)
	load50 := m.estimateCPULoad(50)
	load500 := m.estimateCPULoad(500)
	load5000 := m.estimateCPULoad(5000)

	// Load should increase with goroutine count
	if load50 <= load5 {
		t.Errorf("Load should increase: load(5)=%.1f, load(50)=%.1f", load5, load50)
	}
	if load500 <= load50 {
		t.Errorf("Load should increase: load(50)=%.1f, load(500)=%.1f", load50, load500)
	}
	if load5000 <= load500 {
		t.Errorf("Load should increase: load(500)=%.1f, load(5000)=%.1f", load500, load5000)
	}

	// Load should never be negative
	if load5 < 0 || load50 < 0 || load500 < 0 || load5000 < 0 {
		t.Error("Load should never be negative")
	}

	// Very high goroutine counts should approach high percentages
	if load5000 < 50 {
		t.Errorf("Very high goroutine count should indicate high load: got %.1f", load5000)
	}
}

func TestDoubleStart(t *testing.T) {
	m := NewMonitor(MonitorConfig{
		CheckInterval: 100 * time.Millisecond,
	})

	ctx := context.Background()
	m.Start(ctx)

	// Starting again should be a no-op
	m.Start(ctx)

	m.Stop()
}

func TestDoubleStop(t *testing.T) {
	m := NewMonitor(MonitorConfig{
		CheckInterval: 100 * time.Millisecond,
	})

	// Stopping without start should be a no-op
	m.Stop()

	ctx := context.Background()
	m.Start(ctx)
	m.Stop()

	// Stopping again should be a no-op
	m.Stop()
}

// TestMonitorReusable tests that a monitor can be started, stopped, and started again
func TestMonitorReusable(t *testing.T) {
	m := NewMonitor(MonitorConfig{
		CheckInterval: 50 * time.Millisecond,
	})

	// First cycle
	ctx1 := context.Background()
	m.Start(ctx1)
	time.Sleep(100 * time.Millisecond)

	stats1 := m.GetCurrentLoad()
	if stats1.GoroutineCount == 0 {
		t.Error("First cycle: GoroutineCount should not be 0")
	}

	m.Stop()

	// Second cycle - this used to panic before the fix
	ctx2 := context.Background()
	m.Start(ctx2)
	time.Sleep(100 * time.Millisecond)

	stats2 := m.GetCurrentLoad()
	if stats2.GoroutineCount == 0 {
		t.Error("Second cycle: GoroutineCount should not be 0")
	}

	if !m.ShouldAcceptClient() {
		t.Error("Should accept clients after restart")
	}

	m.Stop()

	// Third cycle for good measure
	ctx3 := context.Background()
	m.Start(ctx3)
	time.Sleep(50 * time.Millisecond)
	m.Stop()
}

// TestOnOverloadCallback tests the overload callback mechanism
func TestOnOverloadCallback(t *testing.T) {
	callbackCalled := make(chan bool, 10)

	m := NewMonitor(MonitorConfig{
		CheckInterval:  50 * time.Millisecond,
		GoroutineLimit: 50, // Low limit to trigger overload easily
		OnOverload: func(overloaded bool, stats LoadStats) {
			callbackCalled <- overloaded
		},
	})

	ctx, cancel := context.WithCancel(context.Background())
	m.Start(ctx)

	// Wait for initial check
	time.Sleep(100 * time.Millisecond)

	// Create goroutines to trigger overload
	stopLoad := make(chan struct{})
	for i := 0; i < 100; i++ {
		go func() { <-stopLoad }()
	}

	// Wait for overload detection
	time.Sleep(200 * time.Millisecond)

	// Check if callback was called with true (overloaded)
	select {
	case overloaded := <-callbackCalled:
		if !overloaded {
			t.Error("Expected overloaded=true in callback")
		}
	case <-time.After(500 * time.Millisecond):
		t.Error("Callback was not called for overload")
	}

	// Release load
	close(stopLoad)
	time.Sleep(200 * time.Millisecond)

	// Check if callback was called with false (normalized)
	select {
	case overloaded := <-callbackCalled:
		if overloaded {
			t.Error("Expected overloaded=false in callback")
		}
	case <-time.After(500 * time.Millisecond):
		t.Error("Callback was not called for normalization")
	}

	cancel()
	m.Stop()
}

// Helper function
func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

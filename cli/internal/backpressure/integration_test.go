//go:build integration
// +build integration

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
	"fmt"
	"runtime"
	"sync"
	"testing"
	"time"
)

// TestRealBackpressure tests back-pressure monitoring on real system
func TestRealBackpressure(t *testing.T) {
	m := NewMonitor(MonitorConfig{
		CPUThreshold:    80.0,
		MemoryThreshold: 90.0,
		CheckInterval:   100 * time.Millisecond,
		Verbosity:       1,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	m.Start(ctx)
	defer m.Stop()

	fmt.Println("\n=== Real Back-Pressure Test ===")

	// Wait for initial measurement
	time.Sleep(200 * time.Millisecond)

	stats := m.GetCurrentLoad()
	fmt.Printf("Initial State:\n")
	fmt.Printf("  CPU: %.1f%%\n", stats.CPUPercent)
	fmt.Printf("  Memory: %.1f%%\n", stats.MemoryPercent)
	fmt.Printf("  Goroutines: %d\n", stats.GoroutineCount)
	fmt.Printf("  Accepting Clients: %v\n", m.ShouldAcceptClient())

	// Simulate load
	fmt.Println("\nSimulating load with 100 goroutines...")
	var wg sync.WaitGroup
	stopLoad := make(chan struct{})

	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stopLoad:
					return
				default:
					// Do some work
					_ = make([]byte, 1024)
					runtime.Gosched()
				}
			}
		}()
	}

	// Let it run for a bit
	time.Sleep(500 * time.Millisecond)

	stats = m.GetCurrentLoad()
	fmt.Printf("\nUnder Load:\n")
	fmt.Printf("  CPU: %.1f%%\n", stats.CPUPercent)
	fmt.Printf("  Memory: %.1f%%\n", stats.MemoryPercent)
	fmt.Printf("  Goroutines: %d\n", stats.GoroutineCount)
	fmt.Printf("  Accepting Clients: %v\n", m.ShouldAcceptClient())
	if stats.RejectReason != "" {
		fmt.Printf("  Reject Reason: %s\n", stats.RejectReason)
	}

	// Stop the load
	close(stopLoad)
	wg.Wait()

	// Wait for recovery
	time.Sleep(500 * time.Millisecond)

	stats = m.GetCurrentLoad()
	fmt.Printf("\nAfter Recovery:\n")
	fmt.Printf("  CPU: %.1f%%\n", stats.CPUPercent)
	fmt.Printf("  Memory: %.1f%%\n", stats.MemoryPercent)
	fmt.Printf("  Goroutines: %d\n", stats.GoroutineCount)
	fmt.Printf("  Accepting Clients: %v\n", m.ShouldAcceptClient())

	fmt.Println("\n================================")
}

// TestSimulateOverload tests the system under extreme load
func TestSimulateOverload(t *testing.T) {
	m := NewMonitor(MonitorConfig{
		CPUThreshold:   50.0, // Lower threshold for testing
		GoroutineLimit: 200,  // Lower limit for testing
		CheckInterval:  50 * time.Millisecond,
		CooldownPeriod: 500 * time.Millisecond,
		Verbosity:      1,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	m.Start(ctx)
	defer m.Stop()

	fmt.Println("\n=== Overload Simulation Test ===")

	// Initial state
	time.Sleep(100 * time.Millisecond)
	fmt.Printf("Initial: Accepting=%v, Goroutines=%d\n",
		m.ShouldAcceptClient(), m.GetCurrentLoad().GoroutineCount)

	// Create many goroutines to trigger goroutine limit
	fmt.Println("Creating 300 goroutines to exceed limit of 200...")
	var wg sync.WaitGroup
	stopLoad := make(chan struct{})

	for i := 0; i < 300; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-stopLoad
		}()
	}

	// Wait for detection
	time.Sleep(200 * time.Millisecond)

	stats := m.GetCurrentLoad()
	fmt.Printf("Under Overload: Accepting=%v, Goroutines=%d\n",
		m.ShouldAcceptClient(), stats.GoroutineCount)
	fmt.Printf("  IsOverloaded: %v\n", stats.IsOverloaded)
	fmt.Printf("  RejectingClients: %v\n", stats.RejectingClients)
	if stats.RejectReason != "" {
		fmt.Printf("  Reason: %s\n", stats.RejectReason)
	}

	// Release goroutines
	close(stopLoad)
	wg.Wait()

	// Wait for cooldown
	fmt.Println("Waiting for cooldown...")
	time.Sleep(700 * time.Millisecond)

	stats = m.GetCurrentLoad()
	fmt.Printf("After Cooldown: Accepting=%v, Goroutines=%d\n",
		m.ShouldAcceptClient(), stats.GoroutineCount)

	fmt.Println("=================================")
}

// TestLongRunningStability tests stability over time
func TestLongRunningStability(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping long-running test in short mode")
	}

	m := NewMonitor(MonitorConfig{
		CheckInterval: 100 * time.Millisecond,
		Verbosity:     0,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	m.Start(ctx)
	defer m.Stop()

	fmt.Println("\n=== Long Running Stability Test (5 seconds) ===")

	startGoroutines := runtime.NumGoroutine()
	var maxGoroutines int

	// Run for 5 seconds with periodic checks
	for i := 0; i < 50; i++ {
		_ = m.ShouldAcceptClient()
		_ = m.GetCurrentLoad()
		_ = m.GetRejectReason()
		_ = m.String()

		current := runtime.NumGoroutine()
		if current > maxGoroutines {
			maxGoroutines = current
		}

		time.Sleep(100 * time.Millisecond)
	}

	endGoroutines := runtime.NumGoroutine()

	fmt.Printf("Start Goroutines: %d\n", startGoroutines)
	fmt.Printf("Max Goroutines: %d\n", maxGoroutines)
	fmt.Printf("End Goroutines: %d\n", endGoroutines)

	// Check for goroutine leak (allow some variance)
	if endGoroutines > startGoroutines+5 {
		t.Errorf("Possible goroutine leak: started with %d, ended with %d",
			startGoroutines, endGoroutines)
	}

	fmt.Println("================================================")
}

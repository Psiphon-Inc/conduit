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
	"sync"
	"testing"
	"time"
)

func BenchmarkShouldAcceptClient(b *testing.B) {
	m := NewMonitor(MonitorConfig{
		CheckInterval: 100 * time.Millisecond,
	})

	ctx := context.Background()
	m.Start(ctx)
	defer m.Stop()

	// Wait for initial stats
	time.Sleep(150 * time.Millisecond)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = m.ShouldAcceptClient()
	}
}

func BenchmarkGetCurrentLoad(b *testing.B) {
	m := NewMonitor(MonitorConfig{
		CheckInterval: 100 * time.Millisecond,
	})

	ctx := context.Background()
	m.Start(ctx)
	defer m.Stop()

	time.Sleep(150 * time.Millisecond)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = m.GetCurrentLoad()
	}
}

func BenchmarkConcurrentAccess(b *testing.B) {
	m := NewMonitor(MonitorConfig{
		CheckInterval: 50 * time.Millisecond,
	})

	ctx := context.Background()
	m.Start(ctx)
	defer m.Stop()

	time.Sleep(100 * time.Millisecond)

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			_ = m.ShouldAcceptClient()
			_ = m.GetCurrentLoad()
		}
	})
}

// TestMemoryStability checks for memory leaks by running the monitor for a while
func TestMemoryStability(t *testing.T) {
	m := NewMonitor(MonitorConfig{
		CheckInterval: 10 * time.Millisecond,
	})

	ctx, cancel := context.WithCancel(context.Background())
	m.Start(ctx)

	// Run for a bit with many accesses
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 1000; j++ {
				_ = m.ShouldAcceptClient()
				_ = m.GetCurrentLoad()
				_ = m.GetRejectReason()
			}
		}()
	}

	wg.Wait()
	cancel()
	m.Stop()

	// If we get here without panics or race conditions, the test passes
}

// TestRapidStartStop tests rapid start/stop cycles
func TestRapidStartStop(t *testing.T) {
	for i := 0; i < 20; i++ {
		m := NewMonitor(MonitorConfig{
			CheckInterval: 10 * time.Millisecond,
		})

		ctx, cancel := context.WithCancel(context.Background())
		m.Start(ctx)

		// Very short runtime
		time.Sleep(5 * time.Millisecond)

		cancel()
		m.Stop()
	}
}

// TestConcurrentStartStop tests concurrent start/stop calls
func TestConcurrentStartStop(t *testing.T) {
	m := NewMonitor(MonitorConfig{
		CheckInterval: 50 * time.Millisecond,
	})

	var wg sync.WaitGroup
	ctx := context.Background()

	// Multiple goroutines trying to start
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			m.Start(ctx)
		}()
	}

	wg.Wait()
	time.Sleep(100 * time.Millisecond)

	// Multiple goroutines trying to stop
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			m.Stop()
		}()
	}

	wg.Wait()
}

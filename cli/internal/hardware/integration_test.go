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

package hardware

import (
	"fmt"
	"runtime"
	"testing"
)

// TestRealHardwareDetection tests actual hardware detection on this machine
func TestRealHardwareDetection(t *testing.T) {
	profile := Detect()

	fmt.Println("=== Real Hardware Detection Results ===")
	fmt.Printf("CPU Cores: %d\n", profile.CPUCores)
	fmt.Printf("Architecture: %s\n", profile.Architecture)
	fmt.Printf("Network Type: %s\n", profile.NetworkType)
	fmt.Printf("Is Low Power: %v\n", profile.IsLowPower)
	fmt.Printf("Recommended Max Clients: %d\n", profile.RecommendedMax)
	fmt.Printf("Profile Name: %s\n", profile.ProfileName)
	if profile.WarningMessage != "" {
		fmt.Printf("Warning: %s\n", profile.WarningMessage)
	}
	fmt.Println("========================================")

	// Verify detection matches runtime
	if profile.CPUCores != runtime.NumCPU() {
		t.Errorf("CPU cores mismatch: detected %d, runtime reports %d",
			profile.CPUCores, runtime.NumCPU())
	}

	if profile.Architecture != runtime.GOARCH {
		t.Errorf("Architecture mismatch: detected %s, runtime reports %s",
			profile.Architecture, runtime.GOARCH)
	}
}

// TestSimulateLowEndHardware simulates various hardware configurations
func TestSimulateLowEndHardware(t *testing.T) {
	scenarios := []struct {
		name         string
		cores        int
		arch         string
		network      string
		expectLowEnd bool
		expectMax    int
	}{
		{
			name:         "Raspberry Pi Zero 2W",
			cores:        1,
			arch:         "arm",
			network:      "wifi",
			expectLowEnd: true,
			expectMax:    5, // Very limited
		},
		{
			name:         "Raspberry Pi 4 (2GB)",
			cores:        4,
			arch:         "arm64",
			network:      "ethernet",
			expectLowEnd: false,
			expectMax:    25,
		},
		{
			name:         "Old Laptop (2-core x86)",
			cores:        2,
			arch:         "amd64",
			network:      "wifi",
			expectLowEnd: false,
			expectMax:    17, // 25 * 0.7 for wifi
		},
		{
			name:         "Desktop PC (4-core)",
			cores:        4,
			arch:         "amd64",
			network:      "ethernet",
			expectLowEnd: false,
			expectMax:    50,
		},
		{
			name:         "Server (8-core)",
			cores:        8,
			arch:         "amd64",
			network:      "ethernet",
			expectLowEnd: false,
			expectMax:    100,
		},
		{
			name:         "High-End Server (16-core)",
			cores:        16,
			arch:         "amd64",
			network:      "ethernet",
			expectLowEnd: false,
			expectMax:    200,
		},
	}

	fmt.Println("\n=== Hardware Simulation Results ===")
	for _, s := range scenarios {
		p := &Profile{
			CPUCores:     s.cores,
			Architecture: s.arch,
			NetworkType:  s.network,
		}
		p.IsLowPower = isLowPowerDevice(p.CPUCores, p.Architecture)
		p.RecommendedMax = calculateRecommendedMax(p)
		p.ProfileName = determineProfileName(p)
		p.WarningMessage = generateWarning(p)

		fmt.Printf("\n%s:\n", s.name)
		fmt.Printf("  Config: %d-core %s, %s\n", s.cores, s.arch, s.network)
		fmt.Printf("  Low Power: %v (expected: %v)\n", p.IsLowPower, s.expectLowEnd)
		fmt.Printf("  Max Clients: %d (expected: %d)\n", p.RecommendedMax, s.expectMax)
		fmt.Printf("  Profile: %s\n", p.ProfileName)
		if p.WarningMessage != "" {
			fmt.Printf("  Warning: %s\n", p.WarningMessage)
		}

		// Verify expectations
		if p.IsLowPower != s.expectLowEnd {
			t.Errorf("%s: IsLowPower mismatch: got %v, expected %v",
				s.name, p.IsLowPower, s.expectLowEnd)
		}

		// Allow some tolerance for max clients
		tolerance := 5
		if p.RecommendedMax < s.expectMax-tolerance || p.RecommendedMax > s.expectMax+tolerance {
			t.Errorf("%s: RecommendedMax out of range: got %d, expected ~%d",
				s.name, p.RecommendedMax, s.expectMax)
		}
	}
	fmt.Println("\n===================================")
}

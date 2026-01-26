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

// Package hardware provides hardware detection and profiling for adaptive client limits
package hardware

import (
	"fmt"
	"net"
	"runtime"
	"strings"
)

// Profile represents detected hardware characteristics and recommended limits
type Profile struct {
	CPUCores       int    // Number of logical CPU cores
	Architecture   string // CPU architecture: "arm", "arm64", "amd64", "386"
	IsLowPower     bool   // True for single-core ARM or similar constrained devices
	NetworkType    string // "ethernet", "wifi", "unknown"
	RecommendedMax int    // Suggested maximum clients based on hardware
	WarningMessage string // Warning message for low-end hardware (empty if none)
	ProfileName    string // Detected profile name: "low-end", "standard", "high-end"
}

// Profile name constants
const (
	ProfileLowEnd   = "low-end"
	ProfileStandard = "standard"
	ProfileHighEnd  = "high-end"
)

// Recommended max clients per profile
const (
	MaxClientsLowEnd   = 10
	MaxClientsStandard = 50
	MaxClientsHighEnd  = 200
)

// Detect analyzes the current hardware and returns a Profile with recommendations
func Detect() *Profile {
	p := &Profile{
		CPUCores:     runtime.NumCPU(),
		Architecture: runtime.GOARCH,
		NetworkType:  detectNetworkType(),
	}

	// Determine if this is a low-power device
	p.IsLowPower = isLowPowerDevice(p.CPUCores, p.Architecture)

	// Calculate recommended max clients
	p.RecommendedMax = calculateRecommendedMax(p)

	// Determine profile name
	p.ProfileName = determineProfileName(p)

	// Generate warning if needed
	p.WarningMessage = generateWarning(p)

	return p
}

// FromProfileName creates a Profile from a named profile (for --profile flag)
func FromProfileName(name string) (*Profile, error) {
	p := &Profile{
		CPUCores:     runtime.NumCPU(),
		Architecture: runtime.GOARCH,
		NetworkType:  detectNetworkType(),
	}

	switch strings.ToLower(name) {
	case ProfileLowEnd:
		p.ProfileName = ProfileLowEnd
		p.RecommendedMax = MaxClientsLowEnd
		p.IsLowPower = true
		p.WarningMessage = "Low-end profile selected: max clients limited to 10"
	case ProfileStandard:
		p.ProfileName = ProfileStandard
		p.RecommendedMax = MaxClientsStandard
		p.IsLowPower = false
	case ProfileHighEnd:
		p.ProfileName = ProfileHighEnd
		p.RecommendedMax = MaxClientsHighEnd
		p.IsLowPower = false
	case "auto":
		// Auto-detect
		return Detect(), nil
	default:
		return nil, fmt.Errorf("unknown profile: %s (valid: low-end, standard, high-end, auto)", name)
	}

	return p, nil
}

// isLowPowerDevice determines if the device is constrained hardware
func isLowPowerDevice(cpuCores int, arch string) bool {
	// Single-core devices are always low-power
	if cpuCores <= 1 {
		return true
	}

	// ARM with 2 cores or less is typically low-power (Raspberry Pi Zero, etc.)
	if isARM(arch) && cpuCores <= 2 {
		return true
	}

	return false
}

// isARM returns true if the architecture is ARM-based
func isARM(arch string) bool {
	return arch == "arm" || arch == "arm64"
}

// calculateRecommendedMax calculates the recommended maximum clients
func calculateRecommendedMax(p *Profile) int {
	baseClients := 0

	// Base calculation on CPU cores and architecture
	switch {
	case p.CPUCores <= 1:
		// Single core: very limited
		baseClients = 5
	case p.CPUCores == 2:
		if isARM(p.Architecture) {
			baseClients = 10
		} else {
			baseClients = 25
		}
	case p.CPUCores <= 4:
		if isARM(p.Architecture) {
			baseClients = 25
		} else {
			baseClients = 50
		}
	case p.CPUCores <= 8:
		baseClients = 100
	default:
		// 8+ cores: high-end
		baseClients = 200
	}

	// Reduce if on WiFi (higher latency, less reliable)
	if p.NetworkType == "wifi" {
		baseClients = int(float64(baseClients) * 0.7)
	}

	// Ensure minimum of 5
	if baseClients < 5 {
		baseClients = 5
	}

	return baseClients
}

// determineProfileName determines the profile category
func determineProfileName(p *Profile) string {
	switch {
	case p.RecommendedMax <= MaxClientsLowEnd:
		return ProfileLowEnd
	case p.RecommendedMax <= MaxClientsStandard:
		return ProfileStandard
	default:
		return ProfileHighEnd
	}
}

// generateWarning generates a warning message for constrained hardware
func generateWarning(p *Profile) string {
	if !p.IsLowPower && p.NetworkType != "wifi" {
		return ""
	}

	var warnings []string

	if p.IsLowPower {
		warnings = append(warnings,
			fmt.Sprintf("Low-power hardware detected (%d-core %s)", p.CPUCores, p.Architecture))
	}

	if p.NetworkType == "wifi" {
		warnings = append(warnings, "WiFi connection detected (higher latency expected)")
	}

	if len(warnings) > 0 {
		return fmt.Sprintf("WARNING: %s. Recommended max clients: %d",
			strings.Join(warnings, "; "), p.RecommendedMax)
	}

	return ""
}

// detectNetworkType attempts to determine the primary network interface type
func detectNetworkType() string {
	interfaces, err := net.Interfaces()
	if err != nil {
		return "unknown"
	}

	hasEthernet := false
	hasWifi := false

	for _, iface := range interfaces {
		// Skip loopback and down interfaces
		if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
			continue
		}

		// Check if interface has addresses (is actually connected)
		addrs, err := iface.Addrs()
		if err != nil || len(addrs) == 0 {
			continue
		}

		name := strings.ToLower(iface.Name)

		// Common ethernet interface names
		if strings.HasPrefix(name, "eth") ||
			strings.HasPrefix(name, "en") ||
			strings.HasPrefix(name, "enp") ||
			strings.HasPrefix(name, "eno") ||
			strings.Contains(name, "ethernet") {
			hasEthernet = true
		}

		// Common WiFi interface names
		if strings.HasPrefix(name, "wl") ||
			strings.HasPrefix(name, "wifi") ||
			strings.HasPrefix(name, "wlan") ||
			strings.Contains(name, "wireless") {
			hasWifi = true
		}
	}

	// Prefer ethernet if available
	if hasEthernet {
		return "ethernet"
	}
	if hasWifi {
		return "wifi"
	}

	return "unknown"
}

// String returns a human-readable summary of the hardware profile
func (p *Profile) String() string {
	return fmt.Sprintf("Hardware Profile: %s (%d-core %s, %s) - Recommended max clients: %d",
		p.ProfileName, p.CPUCores, p.Architecture, p.NetworkType, p.RecommendedMax)
}

// SuggestMaxClients returns the recommended max clients (alias for RecommendedMax)
func (p *Profile) SuggestMaxClients() int {
	return p.RecommendedMax
}

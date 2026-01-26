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
	"runtime"
	"testing"
)

func TestDetect(t *testing.T) {
	profile := Detect()

	// Basic sanity checks
	if profile.CPUCores < 1 {
		t.Errorf("CPUCores should be at least 1, got %d", profile.CPUCores)
	}

	if profile.Architecture == "" {
		t.Error("Architecture should not be empty")
	}

	if profile.Architecture != runtime.GOARCH {
		t.Errorf("Architecture mismatch: got %s, expected %s", profile.Architecture, runtime.GOARCH)
	}

	if profile.RecommendedMax < 5 {
		t.Errorf("RecommendedMax should be at least 5, got %d", profile.RecommendedMax)
	}

	if profile.ProfileName == "" {
		t.Error("ProfileName should not be empty")
	}

	validProfiles := map[string]bool{
		ProfileLowEnd:   true,
		ProfileStandard: true,
		ProfileHighEnd:  true,
	}
	if !validProfiles[profile.ProfileName] {
		t.Errorf("Invalid profile name: %s", profile.ProfileName)
	}

	validNetworkTypes := map[string]bool{
		"ethernet": true,
		"wifi":     true,
		"unknown":  true,
	}
	if !validNetworkTypes[profile.NetworkType] {
		t.Errorf("Invalid network type: %s", profile.NetworkType)
	}
}

func TestFromProfileName(t *testing.T) {
	tests := []struct {
		name           string
		profileName    string
		expectError    bool
		expectedMax    int
		expectedName   string
	}{
		{
			name:         "low-end profile",
			profileName:  "low-end",
			expectError:  false,
			expectedMax:  MaxClientsLowEnd,
			expectedName: ProfileLowEnd,
		},
		{
			name:         "standard profile",
			profileName:  "standard",
			expectError:  false,
			expectedMax:  MaxClientsStandard,
			expectedName: ProfileStandard,
		},
		{
			name:         "high-end profile",
			profileName:  "high-end",
			expectError:  false,
			expectedMax:  MaxClientsHighEnd,
			expectedName: ProfileHighEnd,
		},
		{
			name:        "auto profile",
			profileName: "auto",
			expectError: false,
			// auto returns detected values, so we can't predict exact max
		},
		{
			name:        "invalid profile",
			profileName: "invalid",
			expectError: true,
		},
		{
			name:         "case insensitive",
			profileName:  "LOW-END",
			expectError:  false,
			expectedMax:  MaxClientsLowEnd,
			expectedName: ProfileLowEnd,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			profile, err := FromProfileName(tt.profileName)

			if tt.expectError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if profile == nil {
				t.Error("Expected profile but got nil")
				return
			}

			// For non-auto profiles, check expected values
			if tt.profileName != "auto" {
				if profile.RecommendedMax != tt.expectedMax {
					t.Errorf("RecommendedMax: got %d, expected %d", profile.RecommendedMax, tt.expectedMax)
				}
				if profile.ProfileName != tt.expectedName {
					t.Errorf("ProfileName: got %s, expected %s", profile.ProfileName, tt.expectedName)
				}
			}
		})
	}
}

func TestIsARM(t *testing.T) {
	tests := []struct {
		arch     string
		expected bool
	}{
		{"arm", true},
		{"arm64", true},
		{"amd64", false},
		{"386", false},
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.arch, func(t *testing.T) {
			result := isARM(tt.arch)
			if result != tt.expected {
				t.Errorf("isARM(%s): got %v, expected %v", tt.arch, result, tt.expected)
			}
		})
	}
}

func TestCalculateRecommendedMax(t *testing.T) {
	tests := []struct {
		name     string
		profile  *Profile
		minMax   int
		maxMax   int
	}{
		{
			name: "single core ARM",
			profile: &Profile{
				CPUCores:     1,
				Architecture: "arm",
				NetworkType:  "ethernet",
			},
			minMax: 5,
			maxMax: 10,
		},
		{
			name: "dual core ARM",
			profile: &Profile{
				CPUCores:     2,
				Architecture: "arm64",
				NetworkType:  "ethernet",
			},
			minMax: 5,
			maxMax: 15,
		},
		{
			name: "quad core x86",
			profile: &Profile{
				CPUCores:     4,
				Architecture: "amd64",
				NetworkType:  "ethernet",
			},
			minMax: 40,
			maxMax: 60,
		},
		{
			name: "8 core server",
			profile: &Profile{
				CPUCores:     8,
				Architecture: "amd64",
				NetworkType:  "ethernet",
			},
			minMax: 80,
			maxMax: 120,
		},
		{
			name: "wifi reduces capacity",
			profile: &Profile{
				CPUCores:     4,
				Architecture: "amd64",
				NetworkType:  "wifi",
			},
			minMax: 25,
			maxMax: 45,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculateRecommendedMax(tt.profile)
			if result < tt.minMax || result > tt.maxMax {
				t.Errorf("calculateRecommendedMax: got %d, expected between %d and %d",
					result, tt.minMax, tt.maxMax)
			}
		})
	}
}

func TestProfileString(t *testing.T) {
	profile := &Profile{
		CPUCores:       4,
		Architecture:   "amd64",
		NetworkType:    "ethernet",
		RecommendedMax: 50,
		ProfileName:    ProfileStandard,
	}

	str := profile.String()
	if str == "" {
		t.Error("String() should not return empty string")
	}

	// Check that key information is included
	if !containsAll(str, "standard", "4", "amd64", "ethernet", "50") {
		t.Errorf("String() missing expected content: %s", str)
	}
}

func TestSuggestMaxClients(t *testing.T) {
	profile := &Profile{
		RecommendedMax: 42,
	}

	if profile.SuggestMaxClients() != 42 {
		t.Errorf("SuggestMaxClients: got %d, expected 42", profile.SuggestMaxClients())
	}
}

// Helper function to check if string contains all substrings
func containsAll(s string, substrs ...string) bool {
	for _, substr := range substrs {
		found := false
		for i := 0; i <= len(s)-len(substr); i++ {
			if s[i:i+len(substr)] == substr {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

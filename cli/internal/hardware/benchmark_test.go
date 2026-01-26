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
	"testing"
)

func BenchmarkDetect(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = Detect()
	}
}

func BenchmarkFromProfileName(b *testing.B) {
	profiles := []string{"low-end", "standard", "high-end", "auto"}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = FromProfileName(profiles[i%len(profiles)])
	}
}

func BenchmarkSuggestMaxClients(b *testing.B) {
	p := Detect()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = p.SuggestMaxClients()
	}
}

func BenchmarkCalculateRecommendedMax(b *testing.B) {
	profiles := []*Profile{
		{CPUCores: 1, Architecture: "arm", NetworkType: "wifi"},
		{CPUCores: 4, Architecture: "amd64", NetworkType: "ethernet"},
		{CPUCores: 8, Architecture: "amd64", NetworkType: "ethernet"},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = calculateRecommendedMax(profiles[i%len(profiles)])
	}
}

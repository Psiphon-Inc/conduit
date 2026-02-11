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

package metrics

import (
	"testing"
)

// TestRegistryWiring create a new metrics and calls gather to verify
// that expected metric names exists. It also ensures that registry is
// not empty.
func TestRegistryWiring(t *testing.T) {
	// fake gauge functions
	m := New(GaugeFuncs{
		GetUptimeSeconds: func() float64 { return 123 },
		GetIdleSeconds:   func() float64 { return 0 },
	})

	// gather registry metrics
	mfs, err := m.registry.Gather()
	if err != nil {
		t.Fatalf("failed to gather metrics: %v", err)
	}

	// check if its empty
	if len(mfs) == 0 {
		t.Fatalf("expected metrics to be registered, but registry is empty")
	}

	// collect metric names into a map for quick lookup
	found := make(map[string]struct{})
	for _, mf := range mfs {
		found[mf.GetName()] = struct{}{}
	}

	// list metrics that MUST exist if wiring is correct
	expected := []string{
		"conduit_announcing",
		"conduit_connecting_clients",
		"conduit_connected_clients",
		"conduit_is_live",
		"conduit_max_clients",
		"conduit_bandwidth_limit_bytes_per_second",
		"conduit_bytes_uploaded",
		"conduit_bytes_downloaded",
		"conduit_build_info",
		"conduit_uptime_seconds",
		"conduit_idle_seconds",
	}

	for _, name := range expected {
		if _, ok := found[name]; !ok {
			t.Errorf("expected metric %q to be registered in custom registry", name)
		}
	}
}

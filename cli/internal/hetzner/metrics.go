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

package hetzner

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ServerMetrics holds parsed Conduit + runtime Prometheus metrics for display.
type ServerMetrics struct {
	// Conduit
	ConnectedClients  int
	ConnectingClients int
	IsLive            bool
	MaxClients        int
	UptimeSeconds     float64
	BytesDownloaded   int64
	BytesUploaded     int64
	BandwidthLimitBps int64
	// Build (from conduit_build_info labels)
	BuildRev  string
	GoVersion string
	// Runtime
	GoGoroutines int
	GoThreads    int
	HeapAlloc    int64
	// Process
	ProcessResidentBytes int64
	ProcessCPUSec        float64
	ProcessNetworkRecv   int64
	ProcessNetworkTx     int64
	ProcessOpenFDs       int
	Err                  string
}

const metricsPath = ":9090/metrics"
const metricsTimeout = 5 * time.Second

// FetchMetrics fetches http://ip:9090/metrics and parses conduit_* gauges.
func FetchMetrics(ip string) (ServerMetrics, error) {
	var m ServerMetrics
	url := "http://" + ip + metricsPath
	client := &http.Client{Timeout: metricsTimeout}
	resp, err := client.Get(url)
	if err != nil {
		m.Err = err.Error()
		return m, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		m.Err = fmt.Sprintf("HTTP %d", resp.StatusCode)
		return m, fmt.Errorf("metrics: HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		m.Err = err.Error()
		return m, err
	}
	bodyStr := string(body)
	metrics := parsePrometheusAll(bodyStr)
	m.ConnectedClients = int(getFloat(metrics, "conduit_connected_clients"))
	m.ConnectingClients = int(getFloat(metrics, "conduit_connecting_clients"))
	m.IsLive = getFloat(metrics, "conduit_is_live") == 1
	m.MaxClients = int(getFloat(metrics, "conduit_max_clients"))
	m.UptimeSeconds = getFloat(metrics, "conduit_uptime_seconds")
	m.BytesDownloaded = int64(getFloat(metrics, "conduit_bytes_downloaded"))
	m.BytesUploaded = int64(getFloat(metrics, "conduit_bytes_uploaded"))
	m.BandwidthLimitBps = int64(getFloat(metrics, "conduit_bandwidth_limit_bytes_per_second"))
	m.GoGoroutines = int(getFloat(metrics, "go_goroutines"))
	m.GoThreads = int(getFloat(metrics, "go_threads"))
	m.HeapAlloc = int64(getFloat(metrics, "go_memstats_heap_alloc_bytes"))
	m.ProcessResidentBytes = int64(getFloat(metrics, "process_resident_memory_bytes"))
	m.ProcessCPUSec = getFloat(metrics, "process_cpu_seconds_total")
	m.ProcessNetworkRecv = int64(getFloat(metrics, "process_network_receive_bytes_total"))
	m.ProcessNetworkTx = int64(getFloat(metrics, "process_network_transmit_bytes_total"))
	m.ProcessOpenFDs = int(getFloat(metrics, "process_open_fds"))
	m.BuildRev, m.GoVersion = parseBuildInfoLabels(bodyStr)
	return m, nil
}

// parsePrometheusAll parses Prometheus text format and returns metric name -> value (all metrics).
func parsePrometheusAll(body string) map[string]float64 {
	out := make(map[string]float64)
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		key := fields[0]
		valStr := fields[len(fields)-1]
		if i := strings.Index(key, "{"); i > 0 {
			key = key[:i]
		}
		val, err := strconv.ParseFloat(valStr, 64)
		if err != nil {
			continue
		}
		out[key] = val
	}
	return out
}

// parseBuildInfoLabels extracts build_rev and go_version from conduit_build_info{...} line.
func parseBuildInfoLabels(body string) (buildRev, goVersion string) {
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "conduit_build_info{") {
			continue
		}
		// build_rev="c86a149" go_version="go1.24.12 linux/amd64"
		if i := strings.Index(line, `build_rev="`); i >= 0 {
			start := i + len(`build_rev="`)
			end := strings.Index(line[start:], `"`)
			if end >= 0 {
				buildRev = line[start : start+end]
			}
		}
		if i := strings.Index(line, `go_version="`); i >= 0 {
			start := i + len(`go_version="`)
			end := strings.Index(line[start:], `"`)
			if end >= 0 {
				goVersion = line[start : start+end]
			}
		}
		return buildRev, goVersion
	}
	return "", ""
}

func getFloat(m map[string]float64, key string) float64 {
	if v, ok := m[key]; ok {
		return v
	}
	return 0
}

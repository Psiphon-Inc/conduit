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

// Package metrics provides Prometheus metrics for the Conduit service
package metrics

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/Psiphon-Labs/psiphon-tunnel-core/psiphon/common/buildinfo"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

const namespace = "conduit"

// Metrics holds all Prometheus metrics for the Conduit service
type Metrics struct {
	// Gauges
	ConnectingClients prometheus.Gauge
	ConnectedClients  prometheus.Gauge
	IsLive            prometheus.Gauge
	MaxClients        prometheus.Gauge
	BandwidthLimit    prometheus.Gauge
	UptimeSeconds     prometheus.Gauge
	BytesUploaded     prometheus.Gauge
	BytesDownloaded   prometheus.Gauge

	// Info
	BuildInfo *prometheus.GaugeVec

	registry *prometheus.Registry
	server   *http.Server
}

// New creates a new Metrics instance with all metrics registered
func New() *Metrics {
	registry := prometheus.NewRegistry()

	// Add standard Go metrics
	registry.MustRegister(collectors.NewGoCollector())
	registry.MustRegister(collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))

	m := &Metrics{
		ConnectingClients: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Name:      "connecting_clients",
				Help:      "Number of clients currently connecting to the proxy",
			},
		),
		ConnectedClients: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Name:      "connected_clients",
				Help:      "Number of clients currently connected to the proxy",
			},
		),
		IsLive: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Name:      "is_live",
				Help:      "Whether the service is connected to the Psiphon broker (1 = connected, 0 = disconnected)",
			},
		),
		MaxClients: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Name:      "max_clients",
				Help:      "Maximum number of proxy clients allowed",
			},
		),
		BandwidthLimit: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Name:      "bandwidth_limit_bytes_per_second",
				Help:      "Configured bandwidth limit in bytes per second (0 = unlimited)",
			},
		),
		UptimeSeconds: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Name:      "uptime_seconds",
				Help:      "Number of seconds since the service started",
			},
		),
		BytesUploaded: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Name:      "bytes_uploaded",
				Help:      "Total number of bytes uploaded through the proxy",
			},
		),
		BytesDownloaded: prometheus.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Name:      "bytes_downloaded",
				Help:      "Total number of bytes downloaded through the proxy",
			},
		),
		BuildInfo: prometheus.NewGaugeVec(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Name:      "build_info",
				Help:      "Build information about the Conduit service",
			},
			[]string{"build_repo", "build_rev", "go_version", "values_rev"},
		),
		registry: registry,
	}

	// Register all metrics
	registry.MustRegister(m.ConnectingClients)
	registry.MustRegister(m.ConnectedClients)
	registry.MustRegister(m.IsLive)
	registry.MustRegister(m.MaxClients)
	registry.MustRegister(m.BandwidthLimit)
	registry.MustRegister(m.UptimeSeconds)
	registry.MustRegister(m.BytesUploaded)
	registry.MustRegister(m.BytesDownloaded)
	registry.MustRegister(m.BuildInfo)

	// Set build info

	buildInfo := buildinfo.GetBuildInfo()
	m.BuildInfo.WithLabelValues(buildInfo.BuildRepo, buildInfo.BuildRev, buildInfo.GoVersion, buildInfo.ValuesRev).Set(1)

	return m
}

// SetConfig sets the configuration-related metrics
func (m *Metrics) SetConfig(maxClients int, bandwidthBytesPerSecond int) {
	m.MaxClients.Set(float64(maxClients))
	m.BandwidthLimit.Set(float64(bandwidthBytesPerSecond))
}

// SetConnectingClients updates the connecting clients gauge
func (m *Metrics) SetConnectingClients(count int) {
	m.ConnectingClients.Set(float64(count))
}

// SetConnectedClients updates the connected clients gauge
func (m *Metrics) SetConnectedClients(count int) {
	m.ConnectedClients.Set(float64(count))
}

// SetIsLive updates the live status gauge
func (m *Metrics) SetIsLive(isLive bool) {
	if isLive {
		m.IsLive.Set(1)
	} else {
		m.IsLive.Set(0)
	}
}

// SetUptime updates the uptime gauge
func (m *Metrics) SetUptime(startTime time.Time) {
	m.UptimeSeconds.Set(time.Since(startTime).Seconds())
}

// SetBytesUploaded sets the bytes uploaded gauge
func (m *Metrics) SetBytesUploaded(bytes float64) {
	m.BytesUploaded.Set(bytes)
}

// SetBytesDownloaded sets the bytes downloaded gauge
func (m *Metrics) SetBytesDownloaded(bytes float64) {
	m.BytesDownloaded.Set(bytes)
}

// StartServer starts the HTTP server for Prometheus metrics
func (m *Metrics) StartServer(addr string) error {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{
		EnableOpenMetrics: true,
	}))

	m.server = &http.Server{Addr: addr, Handler: mux}

	// Create a listener to verify the port is available before starting the server
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to bind to %s: %w", addr, err)
	}

	// Start server in background with the pre-created listener
	go func() {
		if err := m.server.Serve(listener); err != nil && err != http.ErrServerClosed {
			fmt.Printf("[ERROR] Metrics server error: %v\n", err)
		}
	}()

	return nil
}

// Shutdown gracefully shuts down the metrics server
func (m *Metrics) Shutdown(ctx context.Context) error {
	if m.server != nil {
		return m.server.Shutdown(ctx)
	}

	return nil
}

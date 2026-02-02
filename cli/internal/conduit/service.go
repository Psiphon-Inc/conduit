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

// Package conduit provides the core Conduit inproxy service
package conduit

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Psiphon-Inc/conduit/cli/internal/config"
	"github.com/Psiphon-Inc/conduit/cli/internal/logging"
	"github.com/Psiphon-Inc/conduit/cli/internal/metrics"
	"github.com/Psiphon-Labs/psiphon-tunnel-core/psiphon"
)

// Service represents the Conduit inproxy service
type Service struct {
	config               *config.Config
	controller           *psiphon.Controller
	stats                *Stats
	metrics              *metrics.Metrics
	mu                   sync.RWMutex
	lastActivityLogTime  time.Time
	lastLoggedAnnouncing int
	lastLoggedConnecting int
	lastLoggedConnected  int

	startTimeUnixNano  int64
	lastActiveUnixNano atomic.Int64
	connectingClients  atomic.Int64
	connectedClients   atomic.Int64
}

// Stats tracks proxy activity statistics
type Stats struct {
	Announcing        int
	ConnectingClients int
	ConnectedClients  int
	TotalBytesUp      int64
	TotalBytesDown    int64
	StartTime         time.Time
	LastActiveTime    time.Time // Last time there was at least one client (connecting or connected)
	IsLive            bool      // Connected to broker and ready to accept clients
}

// StatsJSON represents the JSON structure for persisted stats
type StatsJSON struct {
	Announcing        int    `json:"announcing"`
	ConnectingClients int    `json:"connectingClients"`
	ConnectedClients  int    `json:"connectedClients"`
	TotalBytesUp      int64  `json:"totalBytesUp"`
	TotalBytesDown    int64  `json:"totalBytesDown"`
	UptimeSeconds     int64  `json:"uptimeSeconds"`
	IdleSeconds       int64  `json:"idleSeconds"`
	IsLive            bool   `json:"isLive"`
	Timestamp         string `json:"timestamp"`
}

// New creates a new Conduit service
func New(cfg *config.Config) (*Service, error) {
	s := &Service{
		config: cfg,
		stats: &Stats{
			StartTime: time.Now(),
		},
	}
	s.startTimeUnixNano = s.stats.StartTime.UnixNano()

	if cfg.MetricsAddr != "" {
		s.metrics = metrics.New(metrics.GaugeFuncs{
			GetUptimeSeconds: s.getUptimeSeconds,
			GetIdleSeconds:   s.getIdleSecondsFloat,
		})
		s.metrics.SetConfig(cfg.MaxClients, cfg.BandwidthBytesPerSecond)
	}

	return s, nil
}

// Run starts the Conduit inproxy service and blocks until context is cancelled
func (s *Service) Run(ctx context.Context) error {
	if s.metrics != nil && s.config.MetricsAddr != "" {
		if err := s.metrics.StartServer(s.config.MetricsAddr); err != nil {
			return fmt.Errorf("failed to start metrics server: %w", err)
		}

		logging.Printf("[OK] Prometheus metrics available at http://%s/metrics\n", s.config.MetricsAddr)

		// Ensure metrics server is shut down when we're done
		defer func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()

			if err := s.metrics.Shutdown(ctx); err != nil {
				logging.Printf("[ERROR] Failed to shutdown metrics server: %v\n", err)
			}
		}()
	}

	// Set up notice handling FIRST - before any psiphon calls
	if err := psiphon.SetNoticeWriter(psiphon.NewNoticeReceiver(
		func(notice []byte) {
			s.handleNotice(notice)
		},
	)); err != nil {
		return fmt.Errorf("failed to set notice writer: %w", err)
	}

	// Create Psiphon configuration
	psiphonConfig, err := s.createPsiphonConfig()
	if err != nil {
		return fmt.Errorf("failed to create psiphon config: %w", err)
	}

	bandwidthStr := "unlimited"
	if s.config.BandwidthBytesPerSecond > 0 {
		bandwidthStr = fmt.Sprintf("%.0f Mbps", float64(s.config.BandwidthBytesPerSecond)*8/1000/1000)
	}
	logging.Printf("[OK] Starting Psiphon Conduit (Max Clients: %d, Bandwidth: %s)\n", s.config.MaxClients, bandwidthStr)

	// Open the data store
	err = psiphon.OpenDataStore(&psiphon.Config{
		DataRootDirectory: s.config.DataDir,
	})
	if err != nil {
		return fmt.Errorf("failed to open data store: %w", err)
	}
	defer psiphon.CloseDataStore()

	// Create and run controller
	s.controller, err = psiphon.NewController(psiphonConfig)
	if err != nil {
		return fmt.Errorf("failed to create controller: %w", err)
	}

	// Run the controller (blocks until context is cancelled)
	s.controller.Run(ctx)

	return nil
}

// createPsiphonConfig creates the Psiphon tunnel-core configuration
func (s *Service) createPsiphonConfig() (*psiphon.Config, error) {
	configJSON := make(map[string]interface{})

	// Load base config from psiphon config file or embedded data
	if len(s.config.PsiphonConfigData) > 0 {
		// Use embedded config data
		if err := json.Unmarshal(s.config.PsiphonConfigData, &configJSON); err != nil {
			return nil, fmt.Errorf("failed to parse embedded psiphon config: %w", err)
		}
	} else if s.config.PsiphonConfigPath != "" {
		// Load from file
		data, err := os.ReadFile(s.config.PsiphonConfigPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read psiphon config file: %w", err)
		}
		if err := json.Unmarshal(data, &configJSON); err != nil {
			return nil, fmt.Errorf("failed to parse psiphon config file: %w", err)
		}
	} else {
		return nil, fmt.Errorf("no psiphon config available")
	}

	// Override with our data directory
	configJSON["DataRootDirectory"] = s.config.DataDir

	// Client version - used by broker for compatibility
	configJSON["ClientVersion"] = "1"

	// Inproxy mode settings - these override any values in the base config
	configJSON["InproxyEnableProxy"] = true
	configJSON["InproxyMaxClients"] = s.config.MaxClients
	// Only set bandwidth limits if not unlimited (0 means unlimited)
	if s.config.BandwidthBytesPerSecond > 0 {
		configJSON["InproxyLimitUpstreamBytesPerSecond"] = s.config.BandwidthBytesPerSecond
		configJSON["InproxyLimitDownstreamBytesPerSecond"] = s.config.BandwidthBytesPerSecond
	}
	configJSON["InproxyProxySessionPrivateKey"] = s.config.PrivateKeyBase64

	// Disable regular tunnel functionality - we're just a proxy
	configJSON["DisableTunnels"] = true

	// Disable local proxies (not needed for inproxy mode)
	configJSON["DisableLocalHTTPProxy"] = true
	configJSON["DisableLocalSocksProxy"] = true

	// Enable activity notices for stats
	configJSON["EmitInproxyProxyActivity"] = true

	// Enable diagnostic notices only in verbose modes
	configJSON["EmitDiagnosticNotices"] = s.config.Verbosity >= 1

	// Serialize config
	configData, err := json.Marshal(configJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize config: %w", err)
	}

	// Load and validate config
	psiphonConfig, err := psiphon.LoadConfig(configData)
	if err != nil {
		return nil, fmt.Errorf("failed to load config: %w", err)
	}

	// Commit the config
	if err := psiphonConfig.Commit(true); err != nil {
		return nil, fmt.Errorf("failed to commit config: %w", err)
	}

	return psiphonConfig, nil
}

// updateMetrics updates the metrics from the stats
func (s *Service) updateMetrics() {
	if s.metrics == nil {
		return
	}

	s.metrics.SetAnnouncing(s.stats.Announcing)
	s.metrics.SetConnectingClients(s.stats.ConnectingClients)
	s.metrics.SetConnectedClients(s.stats.ConnectedClients)
	s.metrics.SetBytesUploaded(float64(s.stats.TotalBytesUp))
	s.metrics.SetBytesDownloaded(float64(s.stats.TotalBytesDown))
}

// getUptimeSeconds returns the uptime in seconds (thread-safe, for Prometheus scrape)
func (s *Service) getUptimeSeconds() float64 {
	if s.startTimeUnixNano == 0 {
		return 0
	}
	return time.Since(time.Unix(0, s.startTimeUnixNano)).Seconds()
}

// getIdleSecondsFloat returns how long the proxy has been idle (thread-safe, for Prometheus scrape)
func (s *Service) getIdleSecondsFloat() float64 {
	connecting := s.connectingClients.Load()
	connected := s.connectedClients.Load()
	if connecting > 0 || connected > 0 {
		return 0
	}
	lastActive := s.lastActiveUnixNano.Load()
	if lastActive == 0 {
		if s.startTimeUnixNano == 0 {
			return 0
		}
		return time.Since(time.Unix(0, s.startTimeUnixNano)).Seconds()
	}
	return time.Since(time.Unix(0, lastActive)).Seconds()
}

// calcIdleSeconds calculates idle time. Must be called with lock held.
func (s *Service) calcIdleSeconds() float64 {
	if s.stats.ConnectingClients > 0 || s.stats.ConnectedClients > 0 {
		return 0
	}
	if s.stats.LastActiveTime.IsZero() {
		return time.Since(s.stats.StartTime).Seconds()
	}
	return time.Since(s.stats.LastActiveTime).Seconds()
}

// handleNotice processes notices from psiphon-tunnel-core
func (s *Service) handleNotice(notice []byte) {
	var noticeData struct {
		NoticeType string                 `json:"noticeType"`
		Data       map[string]interface{} `json:"data"`
		Timestamp  string                 `json:"timestamp"`
	}

	if err := json.Unmarshal(notice, &noticeData); err != nil {
		return
	}

	switch noticeData.NoticeType {
	case "InproxyProxyActivity":
		s.mu.Lock()
		prevConnecting := s.stats.ConnectingClients
		prevConnected := s.stats.ConnectedClients
		now := time.Now()
		if v, ok := noticeData.Data["announcing"].(float64); ok {
			s.stats.Announcing = int(v)
		}
		if v, ok := noticeData.Data["connectingClients"].(float64); ok {
			s.stats.ConnectingClients = int(v)
		}
		if v, ok := noticeData.Data["connectedClients"].(float64); ok {
			s.stats.ConnectedClients = int(v)
		}
		if v, ok := noticeData.Data["bytesUp"].(float64); ok {
			s.stats.TotalBytesUp += int64(v)
		}
		if v, ok := noticeData.Data["bytesDown"].(float64); ok {
			s.stats.TotalBytesDown += int64(v)
		}

		// Track last active time for idle calculation
		if s.stats.ConnectingClients > 0 || s.stats.ConnectedClients > 0 {
			s.stats.LastActiveTime = now
			s.lastActiveUnixNano.Store(now.UnixNano())
		}

		becameLive := false
		if !s.stats.IsLive && (s.stats.Announcing > 0 || s.stats.ConnectingClients > 0 || s.stats.ConnectedClients > 0) {
			s.stats.IsLive = true
			if s.metrics != nil {
				s.metrics.SetIsLive(true)
			}
			becameLive = true
		}

		// Log if client counts changed
		if s.stats.ConnectingClients != prevConnecting || s.stats.ConnectedClients != prevConnected {
			s.logStats()
		}

		shouldLog, announcingCount, connectingCount, connectedCount := s.shouldLogInproxyActivity(now)
		s.syncSnapshotLocked()
		s.updateMetrics()

		s.mu.Unlock()
		if becameLive {
			logging.Println("[OK] Announcing presence to Psiphon broker, you will see announcing=1 while bootstrapping is underway")
		}
		if shouldLog {
			logging.Printf("[INFO] Inproxy activity: announcing=%d connecting=%d connected=%d\n",
				announcingCount,
				connectingCount,
				connectedCount,
			)
		}

	case "InproxyProxyTotalActivity":
		// Update stats from total activity notices
		s.mu.Lock()
		prevConnecting := s.stats.ConnectingClients
		prevConnected := s.stats.ConnectedClients
		if v, ok := noticeData.Data["announcing"].(float64); ok {
			s.stats.Announcing = int(v)
		}
		if v, ok := noticeData.Data["connectingClients"].(float64); ok {
			s.stats.ConnectingClients = int(v)
		}
		if v, ok := noticeData.Data["connectedClients"].(float64); ok {
			s.stats.ConnectedClients = int(v)
		}
		if v, ok := noticeData.Data["totalBytesUp"].(float64); ok {
			s.stats.TotalBytesUp = int64(v)
		}
		if v, ok := noticeData.Data["totalBytesDown"].(float64); ok {
			s.stats.TotalBytesDown = int64(v)
		}

		// Track last active time for idle calculation
		if s.stats.ConnectingClients > 0 || s.stats.ConnectedClients > 0 {
			now := time.Now()
			s.stats.LastActiveTime = now
			s.lastActiveUnixNano.Store(now.UnixNano())
		}

		becameLive := false
		if !s.stats.IsLive && (s.stats.Announcing > 0 || s.stats.ConnectingClients > 0 || s.stats.ConnectedClients > 0) {
			s.stats.IsLive = true
			if s.metrics != nil {
				s.metrics.SetIsLive(true)
			}
			becameLive = true
		}

		// Log if client counts changed
		if s.stats.ConnectingClients != prevConnecting || s.stats.ConnectedClients != prevConnected {
			s.logStats()
		}

		s.syncSnapshotLocked()
		s.updateMetrics()

		s.mu.Unlock()
		if becameLive {
			logging.Println("[OK] Announcing to Psiphon broker")
		}

	case "Info":
		if msg, ok := noticeData.Data["message"].(string); ok {
			if s.config.Verbosity >= 1 {
				logging.Printf("[INFO] %s\n", msg)
			}
		}

	case "InproxyMustUpgrade":
		logging.Printf("WARNING: A newer version of Conduit is required. Please upgrade.\n")

	case "Error":
		// Handle errors based on verbosity
		if s.config.Verbosity >= 1 {
			if errMsg, ok := noticeData.Data["error"].(string); ok {
				logging.Printf("[ERROR] %s\n", errMsg)
			} else {
				logging.Printf("[DEBUG] Error: %v\n", noticeData.Data)
			}
		}

	default:
		// Only show debug output in verbose mode (-v)
		if s.config.Verbosity >= 1 {
			logging.Printf("[DEBUG] %s: %v\n", noticeData.NoticeType, noticeData.Data)
		}
	}
}

// logStats logs the current proxy statistics (must be called with lock held)
func (s *Service) logStats() {
	uptime := time.Since(s.stats.StartTime).Truncate(time.Second)
	fmt.Printf("%s [STATS] Connecting: %d | Connected: %d | Up: %s | Down: %s | Uptime: %s\n",
		time.Now().Format("2006-01-02 15:04:05"),
		s.stats.ConnectingClients,
		s.stats.ConnectedClients,
		formatBytes(s.stats.TotalBytesUp),
		formatBytes(s.stats.TotalBytesDown),
		formatDuration(uptime),
	)

	// Write stats to file if configured (copy data while locked, write async)
	if s.config.StatsFile != "" {
		statsJSON := StatsJSON{
			Announcing:        s.stats.Announcing,
			ConnectingClients: s.stats.ConnectingClients,
			ConnectedClients:  s.stats.ConnectedClients,
			TotalBytesUp:      s.stats.TotalBytesUp,
			TotalBytesDown:    s.stats.TotalBytesDown,
			UptimeSeconds:     int64(time.Since(s.stats.StartTime).Seconds()),
			IdleSeconds:       int64(s.calcIdleSeconds()),
			IsLive:            s.stats.IsLive,
			Timestamp:         time.Now().Format(time.RFC3339),
		}
		go s.writeStatsToFile(statsJSON)
	}
}

// syncSnapshotLocked updates atomic snapshot fields. Must be called with lock held.
func (s *Service) syncSnapshotLocked() {
	s.connectingClients.Store(int64(s.stats.ConnectingClients))
	s.connectedClients.Store(int64(s.stats.ConnectedClients))
}

func (s *Service) shouldLogInproxyActivity(now time.Time) (bool, int, int, int) {
	announcing := s.stats.Announcing
	connecting := s.stats.ConnectingClients
	connected := s.stats.ConnectedClients

	connectingChanged := connecting != s.lastLoggedConnecting
	connectedChanged := connected != s.lastLoggedConnected
	if connectingChanged || connectedChanged {
		s.lastLoggedConnecting = connecting
		s.lastLoggedConnected = connected
		s.lastLoggedAnnouncing = announcing
		s.lastActivityLogTime = now
		return true, announcing, connecting, connected
	}

	// If connecting/connected is unchanged, log every minute with the current
	// number of announcing workers. Note that the scrapeable /metrics updates
	// immediately when new data is received, this log is just to indicate
	// activity in the terminal.
	const inproxyActivityLogInterval = time.Minute * 1
	if s.lastActivityLogTime.IsZero() || now.Sub(s.lastActivityLogTime) >= inproxyActivityLogInterval {
		s.lastLoggedAnnouncing = announcing
		s.lastActivityLogTime = now
		return true, announcing, connecting, connected
	}

	return false, announcing, connecting, connected
}

// writeStatsToFile writes stats to the configured JSON file asynchronously
func (s *Service) writeStatsToFile(statsJSON StatsJSON) {
	data, err := json.MarshalIndent(statsJSON, "", "  ")
	if err != nil {
		if s.config.Verbosity >= 1 {
			logging.Printf("[ERROR] Failed to marshal stats: %v\n", err)
		}
		return
	}

	if err := os.WriteFile(s.config.StatsFile, data, 0644); err != nil {
		if s.config.Verbosity >= 1 {
			logging.Printf("[ERROR] Failed to write stats file: %v\n", err)
		}
	}
}

// formatDuration formats duration in a human-readable way
func formatDuration(d time.Duration) string {
	h := d / time.Hour
	m := (d % time.Hour) / time.Minute
	s := (d % time.Minute) / time.Second

	if h > 0 {
		return fmt.Sprintf("%dh%dm%ds", h, m, s)
	} else if m > 0 {
		return fmt.Sprintf("%dm%ds", m, s)
	}
	return fmt.Sprintf("%ds", s)
}

// GetStats returns current statistics
func (s *Service) GetStats() Stats {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return *s.stats
}

// formatBytes formats bytes as a human-readable string
func formatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

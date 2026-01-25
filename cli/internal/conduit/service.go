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
	"strings"
	"sync"
	"time"

	"github.com/Psiphon-Inc/conduit/cli/internal/config"
	"github.com/Psiphon-Labs/psiphon-tunnel-core/psiphon"
)

// Service represents the Conduit inproxy service
type Service struct {
	config     *config.Config
	controller *psiphon.Controller
	stats      *Stats
	mu         sync.RWMutex
}

// Stats tracks proxy activity statistics
type Stats struct {
	ConnectingClients int
	ConnectedClients  int
	TotalBytesUp      int64
	TotalBytesDown    int64
	StartTime         time.Time
	IsLive            bool // Connected to broker and ready to accept clients
}

// StatsJSON represents the JSON structure for persisted stats
type StatsJSON struct {
	ConnectingClients int    `json:"connectingClients"`
	ConnectedClients  int    `json:"connectedClients"`
	TotalBytesUp      int64  `json:"totalBytesUp"`
	TotalBytesDown    int64  `json:"totalBytesDown"`
	UptimeSeconds     int64  `json:"uptimeSeconds"`
	IsLive            bool   `json:"isLive"`
	Timestamp         string `json:"timestamp"`
}

// New creates a new Conduit service
func New(cfg *config.Config) (*Service, error) {
	return &Service{
		config: cfg,
		stats: &Stats{
			StartTime: time.Now(),
		},
	}, nil
}

// Run starts the Conduit inproxy service and blocks until context is cancelled
func (s *Service) Run(ctx context.Context) error {
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

	// Keep diagnostic notices enabled (we filter in handleNotice)
	// This is needed to get the broker connection status
	configJSON["EmitDiagnosticNotices"] = true

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
		// Log if client counts changed
		if s.stats.ConnectingClients != prevConnecting || s.stats.ConnectedClients != prevConnected {
			s.logStats()
		}
		s.mu.Unlock()

	case "InproxyProxyTotalActivity":
		// Update stats from total activity notices
		s.mu.Lock()
		prevConnecting := s.stats.ConnectingClients
		prevConnected := s.stats.ConnectedClients
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
		// Log if client counts changed
		if s.stats.ConnectingClients != prevConnecting || s.stats.ConnectedClients != prevConnected {
			s.logStats()
		}
		s.mu.Unlock()

	case "Info":
		// Check for broker connection status
		if msg, ok := noticeData.Data["message"].(string); ok {
			if strings.HasPrefix(msg, "inproxy: selected broker ") {
				s.mu.Lock()
				if !s.stats.IsLive {
					s.stats.IsLive = true
					s.mu.Unlock()
					fmt.Println("[OK] Connected to Psiphon network")
				} else {
					s.mu.Unlock()
				}
				if s.config.Verbosity >= 2 {
					fmt.Printf("[DEBUG] Info: %v\n", noticeData.Data)
				}
			} else if s.config.Verbosity >= 1 {
				// -v: show info messages except noisy announcement requests
				if msg != "announcement request" {
					fmt.Printf("[INFO] %s\n", msg)
				} else if s.config.Verbosity >= 2 {
					// -vv: show everything including announcement requests
					fmt.Printf("[DEBUG] Info: %v\n", noticeData.Data)
				}
			}
		}

	case "InproxyMustUpgrade":
		fmt.Println("\nWARNING: A newer version of Conduit is required. Please upgrade.")

	case "Error":
		// Handle errors based on verbosity
		if s.config.Verbosity >= 1 {
			if errMsg, ok := noticeData.Data["error"].(string); ok {
				// -v: filter out noisy "limited" errors (normal when no clients available)
				if s.config.Verbosity >= 2 || !isNoisyError(errMsg) {
					fmt.Printf("[ERROR] %s\n", errMsg)
				}
			} else if s.config.Verbosity >= 2 {
				fmt.Printf("[DEBUG] Error: %v\n", noticeData.Data)
			}
		}

	default:
		// Only show debug output in debug mode (-vv)
		if s.config.Verbosity >= 2 {
			// Filter out noisy warnings that are expected in inproxy mode
			if noticeData.NoticeType == "Warning" {
				if msg, ok := noticeData.Data["message"].(string); ok {
					if msg == "tactics request aborted: no capable servers" {
						return
					}
				}
			}
			fmt.Printf("[DEBUG] %s: %v\n", noticeData.NoticeType, noticeData.Data)
		}
	}
}

// isNoisyError returns true for errors that occur frequently during normal operation
func isNoisyError(errMsg string) bool {
	// These errors happen during normal operation and will auto-retry:
	// "limited" - announcement timed out
	// "no match" - no client was waiting
	// "announcement" - general announcement-related errors
	// "502" / "503" / "504" - transient broker/gateway errors
	if strings.HasPrefix(errMsg, "inproxy") {
		return strings.Contains(errMsg, "limited") ||
			strings.Contains(errMsg, "no match") ||
			strings.Contains(errMsg, "announcement") ||
			strings.Contains(errMsg, "status code 502") ||
			strings.Contains(errMsg, "status code 503") ||
			strings.Contains(errMsg, "status code 504")
	}
	return false
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
			ConnectingClients: s.stats.ConnectingClients,
			ConnectedClients:  s.stats.ConnectedClients,
			TotalBytesUp:      s.stats.TotalBytesUp,
			TotalBytesDown:    s.stats.TotalBytesDown,
			UptimeSeconds:     int64(time.Since(s.stats.StartTime).Seconds()),
			IsLive:            s.stats.IsLive,
			Timestamp:         time.Now().Format(time.RFC3339),
		}
		go s.writeStatsToFile(statsJSON)
	}
}

// writeStatsToFile writes stats to the configured JSON file asynchronously
func (s *Service) writeStatsToFile(statsJSON StatsJSON) {
	data, err := json.MarshalIndent(statsJSON, "", "  ")
	if err != nil {
		if s.config.Verbosity >= 1 {
			fmt.Printf("[ERROR] Failed to marshal stats: %v\n", err)
		}
		return
	}

	if err := os.WriteFile(s.config.StatsFile, data, 0644); err != nil {
		if s.config.Verbosity >= 1 {
			fmt.Printf("[ERROR] Failed to write stats file: %v\n", err)
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

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
	"sort"
	"strings"
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
	lastStatsLogAt       time.Time
	regionActivityTotals map[string]map[string]RegionActivityTotals
	metrics              *metrics.Metrics
	mu                   sync.RWMutex

	startTimeUnixNano  int64
	lastActiveUnixNano atomic.Int64
	connectingClients  atomic.Int64
	connectedClients   atomic.Int64
}

const (
	regionScopePersonal      = "personal"
	regionScopeCommon        = "common"
	maxLoggedRegionsPerScope = 3
	bytesProgressLogInterval = 5 * time.Second
)

// RegionActivityTotals tracks accumulated per-region activity from
// InproxyProxyActivity per-notice deltas.
type RegionActivityTotals struct {
	BytesUp           int64
	BytesDown         int64
	ConnectingClients int64
	ConnectedClients  int64
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

// New creates a new Conduit service
func New(cfg *config.Config) (*Service, error) {
	s := &Service{
		config: cfg,
		stats: &Stats{
			StartTime: time.Now(),
		},
		regionActivityTotals: make(map[string]map[string]RegionActivityTotals),
	}
	s.startTimeUnixNano = s.stats.StartTime.UnixNano()

	if cfg.MetricsAddr != "" {
		s.metrics = metrics.New(metrics.GaugeFuncs{
			GetUptimeSeconds: s.getUptimeSeconds,
			GetIdleSeconds:   s.getIdleSecondsFloat,
		})
		s.metrics.SetConfig(cfg.MaxCommonClients, cfg.MaxPersonalClients, cfg.BandwidthBytesPerSecond)
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
	logging.Printf("[OK] Starting Psiphon Conduit (Max Common Clients: %d, Max Personal Clients: %d, Bandwidth: %s)\n", s.config.MaxCommonClients, s.config.MaxPersonalClients, bandwidthStr)

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

	// Apply --set overrides first. These are the remaining keys from --set
	// that were NOT consumed during config resolution (e.g. reduced-hour
	// settings, diagnostic flags). Keys that the config layer resolved
	// (InproxyMaxCommonClients, InproxyMaxPersonalClients, etc.) have
	// already been stripped and are written explicitly below, so any --set
	// values for those keys were already folded into the resolved config.
	for key, value := range s.config.SetOverrides {
		configJSON[key] = value
	}

	// Core inproxy mode settings
	configJSON["InproxyEnableProxy"] = true
	configJSON["InproxyMaxCommonClients"] = s.config.MaxCommonClients
	configJSON["InproxyMaxPersonalClients"] = s.config.MaxPersonalClients
	if s.config.CompartmentID != "" {
		configJSON["InproxyProxyPersonalCompartmentID"] = s.config.CompartmentID
	}
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

	for scope, byRegion := range s.regionActivityTotals {
		for region, totals := range byRegion {
			s.metrics.SetRegionActivity(
				scope,
				region,
				totals.BytesUp,
				totals.BytesDown,
				totals.ConnectingClients,
				totals.ConnectedClients,
			)
		}
	}
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
		prevAnnouncing := s.stats.Announcing
		prevConnecting := s.stats.ConnectingClients
		prevConnected := s.stats.ConnectedClients
		prevBytesUp := s.stats.TotalBytesUp
		prevBytesDown := s.stats.TotalBytesDown
		now := time.Now()
		if v, ok := int64FromValue(noticeData.Data["announcing"]); ok {
			s.stats.Announcing = int(v)
		}
		if v, ok := int64FromValue(noticeData.Data["connectingClients"]); ok {
			s.stats.ConnectingClients = int(v)
		}
		if v, ok := int64FromValue(noticeData.Data["connectedClients"]); ok {
			s.stats.ConnectedClients = int(v)
		}
		if v, ok := int64FromValue(noticeData.Data["bytesUp"]); ok {
			s.stats.TotalBytesUp += v
		}
		if v, ok := int64FromValue(noticeData.Data["bytesDown"]); ok {
			s.stats.TotalBytesDown += v
		}
		if values, ok := parseRegionActivity(noticeData.Data["personalRegionActivity"]); ok {
			s.accumulateRegionActivityLocked(regionScopePersonal, values)
		}
		if values, ok := parseRegionActivity(noticeData.Data["commonRegionActivity"]); ok {
			s.accumulateRegionActivityLocked(regionScopeCommon, values)
		}

		// Track last active time for idle calculation
		if s.stats.ConnectingClients > 0 || s.stats.ConnectedClients > 0 {
			s.stats.LastActiveTime = now
			s.lastActiveUnixNano.Store(now.UnixNano())
		}

		if !s.stats.IsLive && (s.stats.Announcing > 0 || s.stats.ConnectingClients > 0 || s.stats.ConnectedClients > 0) {
			s.stats.IsLive = true
			if s.metrics != nil {
				s.metrics.SetIsLive(true)
			}
		}

		stateChanged := s.stats.Announcing != prevAnnouncing || s.stats.ConnectingClients != prevConnecting || s.stats.ConnectedClients != prevConnected
		bytesChanged := s.stats.TotalBytesUp != prevBytesUp || s.stats.TotalBytesDown != prevBytesDown

		// Log when announcing/connectivity changes, and periodically while
		// bytes are changing so transfer progress stays visible.
		if stateChanged || (bytesChanged && (s.lastStatsLogAt.IsZero() || now.Sub(s.lastStatsLogAt) >= bytesProgressLogInterval)) {
			s.logStats(now)
		}

		s.syncSnapshotLocked()
		s.updateMetrics()

		s.mu.Unlock()

	case "InproxyProxyTotalActivity":
		// Update stats from total activity notices
		s.mu.Lock()
		prevAnnouncing := s.stats.Announcing
		prevConnecting := s.stats.ConnectingClients
		prevConnected := s.stats.ConnectedClients
		prevBytesUp := s.stats.TotalBytesUp
		prevBytesDown := s.stats.TotalBytesDown
		now := time.Now()
		if v, ok := int64FromValue(noticeData.Data["announcing"]); ok {
			s.stats.Announcing = int(v)
		}
		if v, ok := int64FromValue(noticeData.Data["connectingClients"]); ok {
			s.stats.ConnectingClients = int(v)
		}
		if v, ok := int64FromValue(noticeData.Data["connectedClients"]); ok {
			s.stats.ConnectedClients = int(v)
		}
		if v, ok := int64FromValue(noticeData.Data["totalBytesUp"]); ok {
			s.stats.TotalBytesUp = v
		}
		if v, ok := int64FromValue(noticeData.Data["totalBytesDown"]); ok {
			s.stats.TotalBytesDown = v
		}

		// Track last active time for idle calculation
		if s.stats.ConnectingClients > 0 || s.stats.ConnectedClients > 0 {
			s.stats.LastActiveTime = now
			s.lastActiveUnixNano.Store(now.UnixNano())
		}

		if !s.stats.IsLive && (s.stats.Announcing > 0 || s.stats.ConnectingClients > 0 || s.stats.ConnectedClients > 0) {
			s.stats.IsLive = true
			if s.metrics != nil {
				s.metrics.SetIsLive(true)
			}
		}

		stateChanged := s.stats.Announcing != prevAnnouncing || s.stats.ConnectingClients != prevConnecting || s.stats.ConnectedClients != prevConnected
		bytesChanged := s.stats.TotalBytesUp != prevBytesUp || s.stats.TotalBytesDown != prevBytesDown

		if stateChanged || (bytesChanged && (s.lastStatsLogAt.IsZero() || now.Sub(s.lastStatsLogAt) >= bytesProgressLogInterval)) {
			s.logStats(now)
		}

		s.syncSnapshotLocked()
		s.updateMetrics()

		s.mu.Unlock()

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
func (s *Service) logStats(now time.Time) {
	s.lastStatsLogAt = now
	uptime := now.Sub(s.stats.StartTime).Truncate(time.Second)
	regionSummary := s.formatRegionActivityTotalsLocked()
	fmt.Printf("%s [STATS] Announcing: %d | Connecting: %d | Connected: %d | Up: %s | Down: %s | Uptime: %s | Regions: %s\n",
		now.Format("2006-01-02 15:04:05"),
		s.stats.Announcing,
		s.stats.ConnectingClients,
		s.stats.ConnectedClients,
		formatBytes(s.stats.TotalBytesUp),
		formatBytes(s.stats.TotalBytesDown),
		formatDuration(uptime),
		regionSummary,
	)
}

// syncSnapshotLocked updates atomic snapshot fields. Must be called with lock held.
func (s *Service) syncSnapshotLocked() {
	s.connectingClients.Store(int64(s.stats.ConnectingClients))
	s.connectedClients.Store(int64(s.stats.ConnectedClients))
}

// formatRegionActivityTotalsLocked returns an aggregated region summary string.
// Must be called with lock held.
func (s *Service) formatRegionActivityTotalsLocked() string {
	personalSummary := formatRegionScopeTotals(s.regionActivityTotals[regionScopePersonal])
	commonSummary := formatRegionScopeTotals(s.regionActivityTotals[regionScopeCommon])

	parts := make([]string, 0, 2)
	if personalSummary != "-" {
		parts = append(parts, fmt.Sprintf("personal[%s]", personalSummary))
	}
	if commonSummary != "-" {
		parts = append(parts, fmt.Sprintf("common[%s]", commonSummary))
	}

	if len(parts) == 0 {
		return "none"
	}

	return strings.Join(parts, " ")
}

func formatRegionScopeTotals(byRegion map[string]RegionActivityTotals) string {
	if len(byRegion) == 0 {
		return "-"
	}

	regions := make([]string, 0, len(byRegion))
	for region := range byRegion {
		regions = append(regions, region)
	}
	sort.Slice(regions, func(i, j int) bool {
		left := byRegion[regions[i]].BytesUp + byRegion[regions[i]].BytesDown
		right := byRegion[regions[j]].BytesUp + byRegion[regions[j]].BytesDown
		if left == right {
			return regions[i] < regions[j]
		}
		return left > right
	})

	limit := len(regions)
	if limit > maxLoggedRegionsPerScope {
		limit = maxLoggedRegionsPerScope
	}

	parts := make([]string, 0, limit+1)
	for i := 0; i < limit; i++ {
		region := regions[i]
		totals := byRegion[region]
		transferTotal := totals.BytesUp + totals.BytesDown
		parts = append(parts, fmt.Sprintf(
			"%s(conn:%d|traffic:%s)",
			region,
			totals.ConnectedClients,
			formatBytes(transferTotal),
		))
	}

	if len(regions) > limit {
		parts = append(parts, fmt.Sprintf("(+%d more...)", len(regions)-limit))
	}

	return strings.Join(parts, ", ")
}

// accumulateRegionActivityLocked accumulates per-region byte deltas and
// updates per-region client counts as latest values from the notice.
// Must be called with lock held.
func (s *Service) accumulateRegionActivityLocked(scope string, deltas map[string]RegionActivityTotals) {
	if s.regionActivityTotals == nil {
		s.regionActivityTotals = make(map[string]map[string]RegionActivityTotals)
	}
	if s.regionActivityTotals[scope] == nil {
		s.regionActivityTotals[scope] = make(map[string]RegionActivityTotals)
	}

	// Connecting/connected are latest values, not accumulated totals.
	for region, totals := range s.regionActivityTotals[scope] {
		totals.ConnectingClients = 0
		totals.ConnectedClients = 0
		s.regionActivityTotals[scope][region] = totals
	}

	for region, delta := range deltas {
		totals := s.regionActivityTotals[scope][region]
		totals.BytesUp += delta.BytesUp
		totals.BytesDown += delta.BytesDown
		totals.ConnectingClients = delta.ConnectingClients
		totals.ConnectedClients = delta.ConnectedClients
		s.regionActivityTotals[scope][region] = totals
	}
}

func parseRegionActivity(raw interface{}) (map[string]RegionActivityTotals, bool) {
	activityByRegion, ok := raw.(map[string]interface{})
	if !ok {
		return nil, false
	}

	parsed := make(map[string]RegionActivityTotals, len(activityByRegion))
	for region, value := range activityByRegion {
		activityData, ok := value.(map[string]interface{})
		if !ok {
			continue
		}

		var totals RegionActivityTotals
		if v, ok := int64FromValue(activityData["bytesUp"]); ok {
			totals.BytesUp = v
		}
		if v, ok := int64FromValue(activityData["bytesDown"]); ok {
			totals.BytesDown = v
		}
		if v, ok := int64FromValue(activityData["connectingClients"]); ok {
			totals.ConnectingClients = v
		}
		if v, ok := int64FromValue(activityData["connectedClients"]); ok {
			totals.ConnectedClients = v
		}

		parsed[region] = totals
	}

	return parsed, true
}

func int64FromValue(value interface{}) (int64, bool) {
	switch v := value.(type) {
	case nil:
		return 0, false
	case int:
		return int64(v), true
	case int8:
		return int64(v), true
	case int16:
		return int64(v), true
	case int32:
		return int64(v), true
	case int64:
		return v, true
	case uint:
		return int64(v), true
	case uint8:
		return int64(v), true
	case uint16:
		return int64(v), true
	case uint32:
		return int64(v), true
	case uint64:
		return int64(v), true
	case float32:
		return int64(v), true
	case float64:
		return int64(v), true
	case json.Number:
		parsed, err := v.Int64()
		if err != nil {
			return 0, false
		}
		return parsed, true
	default:
		return 0, false
	}
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

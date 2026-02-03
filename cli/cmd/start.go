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

package cmd

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/Psiphon-Inc/conduit/cli/internal/conduit"
	"github.com/Psiphon-Inc/conduit/cli/internal/config"
	"github.com/Psiphon-Inc/conduit/cli/internal/logging"
	"github.com/spf13/cobra"
)

var (
	maxClients                int
	bandwidthMbps             float64
	psiphonConfigPath         string
	statsFilePath             string
	metricsAddr               string
	trafficLimitGB            float64
	trafficPeriodDays         int
	bandwidthThresholdPercent int
	minConnections            int
	minBandwidthMbps          float64
)

var startCmd = &cobra.Command{
	Use:   "start",
	Short: "Start the Conduit inproxy service",
	Long:  getStartLongHelp(),
	RunE:  runStart,
}

func getStartLongHelp() string {
	if config.HasEmbeddedConfig() {
		return `Start the Conduit inproxy service to relay traffic for users in censored regions.`
	}
	return `Start the Conduit inproxy service to relay traffic for users in censored regions.

Requires a Psiphon network configuration file (JSON) containing the
PropagationChannelId, SponsorId, and broker specifications.`
}

func init() {
	rootCmd.AddCommand(startCmd)

	startCmd.Flags().IntVarP(&maxClients, "max-clients", "m", config.DefaultMaxClients, "maximum number of proxy clients (1-1000)")
	startCmd.Flags().Float64VarP(&bandwidthMbps, "bandwidth", "b", config.DefaultBandwidthMbps, "total bandwidth limit in Mbps (-1 for unlimited)")
	startCmd.Flags().StringVarP(&statsFilePath, "stats-file", "s", "", "persist stats to JSON file (default: stats.json in data dir if flag used without value)")
	startCmd.Flags().Lookup("stats-file").NoOptDefVal = "stats.json"
	startCmd.Flags().StringVar(&metricsAddr, "metrics-addr", "", "address for Prometheus metrics endpoint (e.g., :9090 or 127.0.0.1:9090)")
	startCmd.Flags().StringVarP(&psiphonConfigPath, "psiphon-config", "c", "", "path to Psiphon network config file (JSON)")

	// Traffic throttling flags
	startCmd.Flags().Float64VarP(&trafficLimitGB, "traffic-limit", "t", 0,
		fmt.Sprintf("total traffic limit in GB (minimum %d GB, 0 for unlimited)", config.MinTrafficLimitGB))
	startCmd.Flags().IntVarP(&trafficPeriodDays, "traffic-period", "p", 0,
		fmt.Sprintf("time period in days (minimum %d days, requires --traffic-limit)", config.MinTrafficPeriodDays))
	startCmd.Flags().IntVar(&bandwidthThresholdPercent, "bandwidth-threshold", config.DefaultThresholdPercent,
		fmt.Sprintf("throttle when this percentage of quota is used (%d-%d%%, default %d)",
			config.MinThresholdPercent, config.MaxThresholdPercent, config.DefaultThresholdPercent))
	startCmd.Flags().IntVar(&minConnections, "min-connections", config.DefaultMinConnections,
		fmt.Sprintf("max clients when throttled (default %d)", config.DefaultMinConnections))
	startCmd.Flags().Float64Var(&minBandwidthMbps, "min-bandwidth", config.DefaultMinBandwidthMbps,
		fmt.Sprintf("bandwidth in Mbps when throttled (default %.0f)", config.DefaultMinBandwidthMbps))
}

func runStart(cmd *cobra.Command, args []string) error {
	// Determine psiphon config source: flag > embedded > error
	effectiveConfigPath := psiphonConfigPath
	useEmbedded := false

	if psiphonConfigPath != "" {
		// User provided a config path - validate it exists
		if _, err := os.Stat(psiphonConfigPath); os.IsNotExist(err) {
			return fmt.Errorf("psiphon config file not found: %s", psiphonConfigPath)
		}
	} else if config.HasEmbeddedConfig() {
		// No flag provided, but we have embedded config
		useEmbedded = true
	} else {
		// No flag and no embedded config
		return fmt.Errorf("psiphon config required: use --psiphon-config flag or build with embedded config")
	}

	// Resolve stats file path - if relative, place in data dir
	resolvedStatsFile := statsFilePath
	if resolvedStatsFile != "" && !filepath.IsAbs(resolvedStatsFile) {
		resolvedStatsFile = filepath.Join(GetDataDir(), resolvedStatsFile)
	}

	maxClientsFromFlag := 0
	if cmd.Flags().Changed("max-clients") {
		if maxClients < 1 {
			return fmt.Errorf("max-clients must be between 1 and %d", config.MaxClientsLimit)
		}
		maxClientsFromFlag = maxClients
	}

	bandwidthFromFlag := 0.0
	bandwidthFromFlagSet := false
	if cmd.Flags().Changed("bandwidth") {
		if bandwidthMbps != config.UnlimitedBandwidth && bandwidthMbps < 1 {
			return fmt.Errorf("bandwidth must be at least 1 Mbps (or -1 for unlimited)")
		}
		bandwidthFromFlag = bandwidthMbps
		bandwidthFromFlagSet = true
	}

	// Load or create configuration (auto-generates keys on first run)
	cfg, err := config.LoadOrCreate(config.Options{
		DataDir:                   GetDataDir(),
		PsiphonConfigPath:         effectiveConfigPath,
		UseEmbeddedConfig:         useEmbedded,
		MaxClients:                maxClientsFromFlag,
		BandwidthMbps:             bandwidthFromFlag,
		BandwidthSet:              bandwidthFromFlagSet,
		Verbosity:                 Verbosity(),
		StatsFile:                 resolvedStatsFile,
		MetricsAddr:               metricsAddr,
		TrafficLimitGB:            trafficLimitGB,
		TrafficPeriodDays:         trafficPeriodDays,
		BandwidthThresholdPercent: bandwidthThresholdPercent,
		MinConnections:            minConnections,
		MinBandwidthMbps:          minBandwidthMbps,
	})
	if err != nil {
		return fmt.Errorf("failed to load configuration: %w", err)
	}

	// Display traffic throttling info if configured
	if cfg.TrafficLimitBytes > 0 {
		logging.Printf("Traffic Throttling Enabled:")
		logging.Printf("  Limit: %.0f GB per %d days", trafficLimitGB, trafficPeriodDays)
		logging.Printf("  Throttle at: %d%% (%.0f GB)", bandwidthThresholdPercent,
			float64(cfg.BandwidthThresholdBytes)/(1024*1024*1024))
		logging.Printf("  Throttled capacity: %d clients, %.0f Mbps",
			cfg.MinConnections, minBandwidthMbps)
		logging.Printf("  Normal capacity: %d clients, %.0f Mbps",
			cfg.NormalMaxClients, float64(cfg.NormalBandwidthBytesPerSec)*8/(1000*1000))
	}

	// Create conduit service
	service, err := conduit.New(cfg)
	if err != nil {
		return fmt.Errorf("failed to create conduit service: %w", err)
	}

	// Setup context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle shutdown signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		logging.Println("Shutting down...")
		cancel()
	}()

	// Run the service
	if err := service.Run(ctx); err != nil && ctx.Err() == nil {
		return fmt.Errorf("conduit service error: %w", err)
	}

	logging.Println("Stopped.")
	return nil
}

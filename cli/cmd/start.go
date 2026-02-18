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
	maxCommonClients   int
	maxPersonalClients int
	compartmentID      string
	setOverrides       []string
	bandwidthMbps      float64
	psiphonConfigPath  string
	statsFilePath      string
	metricsAddr        string
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

	startCmd.Flags().IntVarP(&maxCommonClients, "max-common-clients", "m", config.DefaultMaxClients, "maximum number of common proxy clients (0-1000)")
	startCmd.Flags().IntVar(&maxPersonalClients, "max-personal-clients", 0, "maximum number of personal proxy clients (0-1000)")
	startCmd.Flags().StringVar(&compartmentID, "compartment-id", "", "personal compartment ID or share token")
	startCmd.Flags().StringArrayVar(&setOverrides, "set", nil, "override allowed config values (key=value), repeatable")
	startCmd.Flags().Float64VarP(&bandwidthMbps, "bandwidth", "b", config.DefaultBandwidthMbps, "total bandwidth limit in Mbps (-1 for unlimited)")
	startCmd.Flags().StringVarP(&statsFilePath, "stats-file", "s", "", "persist stats to JSON file (default: stats.json in data dir if flag used without value)")
	startCmd.Flags().Lookup("stats-file").NoOptDefVal = "stats.json"
	startCmd.Flags().StringVar(&metricsAddr, "metrics-addr", "", "address for Prometheus metrics endpoint (e.g., :9090 or 127.0.0.1:9090)")
	startCmd.Flags().StringVarP(&psiphonConfigPath, "psiphon-config", "c", "", "path to Psiphon network config file (JSON)")
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

	maxCommonClientsFromFlag := 0
	maxCommonClientsFromFlagSet := cmd.Flags().Changed("max-common-clients")
	if maxCommonClientsFromFlagSet {
		if maxCommonClients < 0 || maxCommonClients > config.MaxClientsLimit {
			return fmt.Errorf("max-common-clients must be between 0 and %d", config.MaxClientsLimit)
		}
		maxCommonClientsFromFlag = maxCommonClients
	}

	maxPersonalClientsFromFlag := 0
	maxPersonalClientsFromFlagSet := cmd.Flags().Changed("max-personal-clients")
	if maxPersonalClientsFromFlagSet {
		if maxPersonalClients < 0 || maxPersonalClients > config.MaxClientsLimit {
			return fmt.Errorf("max-personal-clients must be between 0 and %d", config.MaxClientsLimit)
		}
		maxPersonalClientsFromFlag = maxPersonalClients
	}

	parsedSetOverrides, err := config.ParseSetOverrides(setOverrides)
	if err != nil {
		return err
	}

	compartmentIDFromFlag := ""
	compartmentIDFromFlagSet := cmd.Flags().Changed("compartment-id")
	if compartmentIDFromFlagSet {
		normalizedCompartmentID, err := config.NormalizePersonalCompartmentInput(compartmentID)
		if err != nil {
			return err
		}
		compartmentIDFromFlag = normalizedCompartmentID
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
		DataDir:               GetDataDir(),
		PsiphonConfigPath:     effectiveConfigPath,
		UseEmbeddedConfig:     useEmbedded,
		MaxCommonClients:      maxCommonClientsFromFlag,
		MaxCommonClientsSet:   maxCommonClientsFromFlagSet,
		MaxPersonalClients:    maxPersonalClientsFromFlag,
		MaxPersonalClientsSet: maxPersonalClientsFromFlagSet,
		CompartmentID:         compartmentIDFromFlag,
		CompartmentIDSet:      compartmentIDFromFlagSet,
		SetOverrides:          parsedSetOverrides,
		BandwidthMbps:         bandwidthFromFlag,
		BandwidthSet:          bandwidthFromFlagSet,
		Verbosity:             Verbosity(),
		StatsFile:             resolvedStatsFile,
		MetricsAddr:           metricsAddr,
	})
	if err != nil {
		return fmt.Errorf("failed to load configuration: %w", err)
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

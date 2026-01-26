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
	"github.com/Psiphon-Inc/conduit/cli/internal/hardware"
	"github.com/spf13/cobra"
)

var (
	maxClients        int
	bandwidthMbps     float64
	psiphonConfigPath string
	statsFilePath     string
	adaptiveMode      bool
	backPressure      bool
	profile           string
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

	// Only show --psiphon-config flag if no config is embedded
	if !config.HasEmbeddedConfig() {
		startCmd.Flags().StringVarP(&psiphonConfigPath, "psiphon-config", "c", "", "path to Psiphon network config file (JSON)")
	}

	// Hardware-aware and back-pressure flags
	startCmd.Flags().BoolVar(&adaptiveMode, "adaptive", false, "enable hardware-aware automatic limits")
	startCmd.Flags().BoolVar(&backPressure, "backpressure", false, "enable system load monitoring and warnings")
	startCmd.Flags().StringVar(&profile, "profile", "", "hardware profile: low-end, standard, high-end, auto")
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

	// Handle hardware-aware limits
	effectiveMaxClients := maxClients
	effectiveProfile := profile

	// If --adaptive or --profile auto, detect hardware and adjust limits
	if adaptiveMode || profile == "auto" {
		hwProfile := hardware.Detect()
		if Verbosity() >= 1 {
			fmt.Printf("[INFO] %s\n", hwProfile.String())
		}
		if hwProfile.WarningMessage != "" {
			fmt.Printf("[WARNING] %s\n", hwProfile.WarningMessage)
		}

		// Only override max-clients if user didn't explicitly set it
		if !cmd.Flags().Changed("max-clients") {
			effectiveMaxClients = hwProfile.SuggestMaxClients()
			if Verbosity() >= 1 {
				fmt.Printf("[INFO] Auto-adjusted max-clients to %d based on hardware\n", effectiveMaxClients)
			}
		}
		effectiveProfile = hwProfile.ProfileName
	} else if profile != "" {
		// User specified a profile explicitly
		hwProfile, err := hardware.FromProfileName(profile)
		if err != nil {
			return fmt.Errorf("invalid profile: %w", err)
		}
		if !cmd.Flags().Changed("max-clients") {
			effectiveMaxClients = hwProfile.SuggestMaxClients()
		}
		effectiveProfile = hwProfile.ProfileName
		if hwProfile.WarningMessage != "" {
			fmt.Printf("[INFO] %s\n", hwProfile.WarningMessage)
		}
	}

	// Load or create configuration (auto-generates keys on first run)
	cfg, err := config.LoadOrCreate(config.Options{
		DataDir:           GetDataDir(),
		PsiphonConfigPath: effectiveConfigPath,
		UseEmbeddedConfig: useEmbedded,
		MaxClients:        effectiveMaxClients,
		BandwidthMbps:     bandwidthMbps,
		Verbosity:         Verbosity(),
		StatsFile:         resolvedStatsFile,
		AdaptiveMode:      adaptiveMode,
		BackPressure:      backPressure,
		Profile:           effectiveProfile,
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
		fmt.Println("\nShutting down...")
		cancel()
	}()

	// Print startup message
	bandwidthStr := "unlimited"
	if bandwidthMbps != config.UnlimitedBandwidth {
		bandwidthStr = fmt.Sprintf("%.0f Mbps", bandwidthMbps)
	}

	// Build startup message with optional features
	startupMsg := fmt.Sprintf("Starting Psiphon Conduit (Max Clients: %d, Bandwidth: %s", cfg.MaxClients, bandwidthStr)
	if cfg.AdaptiveMode {
		startupMsg += ", Adaptive: ON"
	}
	if cfg.BackPressure {
		startupMsg += ", BackPressure: ON"
	}
	if cfg.Profile != "" {
		startupMsg += fmt.Sprintf(", Profile: %s", cfg.Profile)
	}
	startupMsg += ")"
	fmt.Println(startupMsg)

	// Run the service
	if err := service.Run(ctx); err != nil && ctx.Err() == nil {
		return fmt.Errorf("conduit service error: %w", err)
	}

	fmt.Println("Stopped.")
	return nil
}

//go:build windows

/*
 * Copyright (c) 2024, Psiphon Inc.
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

	"github.com/Psiphon-Inc/conduit/cli/internal/conduit"
	"github.com/Psiphon-Inc/conduit/cli/internal/config"
	"github.com/Psiphon-Inc/conduit/cli/internal/service"
	"github.com/spf13/cobra"
)

var serviceRunCmd = &cobra.Command{
	Use:    "run",
	Short:  "Run as Windows service (internal use)",
	Hidden: true,
	RunE:   runServiceRun,
}

// Service run flags (same as start command)
var (
	svcRunMaxClients        int
	svcRunBandwidthMbps     float64
	svcRunPsiphonConfigPath string
	svcRunDataDir           string
	svcRunVerbose           bool
)

func init() {
	serviceCmd.AddCommand(serviceRunCmd)

	serviceRunCmd.Flags().IntVarP(&svcRunMaxClients, "max-clients", "m", 200, "maximum number of proxy clients")
	serviceRunCmd.Flags().Float64VarP(&svcRunBandwidthMbps, "bandwidth", "b", 5, "bandwidth limit per peer in Mbps")
	serviceRunCmd.Flags().StringVarP(&svcRunPsiphonConfigPath, "psiphon-config", "c", "", "path to Psiphon network config file")
	serviceRunCmd.Flags().StringVarP(&svcRunDataDir, "data-dir", "d", "", "data directory for keys and state")
	serviceRunCmd.Flags().BoolVarP(&svcRunVerbose, "verbose", "v", false, "enable verbose logging")
}

func runServiceRun(cmd *cobra.Command, args []string) error {
	// This runs as a Windows service
	return service.RunAsWindowsService(func(ctx context.Context) error {
		// Determine config source
		useEmbedded := false
		if svcRunPsiphonConfigPath == "" && config.HasEmbeddedConfig() {
			useEmbedded = true
		} else if svcRunPsiphonConfigPath == "" {
			return fmt.Errorf("psiphon config required")
		}

		// Load configuration
		cfg, err := config.LoadOrCreate(config.Options{
			DataDir:           svcRunDataDir,
			PsiphonConfigPath: svcRunPsiphonConfigPath,
			UseEmbeddedConfig: useEmbedded,
			MaxClients:        svcRunMaxClients,
			BandwidthMbps:     svcRunBandwidthMbps,
			Verbose:           svcRunVerbose,
			IsTTY:             false,
		})
		if err != nil {
			return fmt.Errorf("failed to load configuration: %w", err)
		}

		// Create and run conduit service
		svc, err := conduit.New(cfg)
		if err != nil {
			return fmt.Errorf("failed to create conduit service: %w", err)
		}

		return svc.Run(ctx)
	})
}

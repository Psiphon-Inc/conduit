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
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// RootCMD is the main command of the cli.
type RootCMD struct {
	// public fields
	Version string

	// private fields
	verbosity int
	dataDir   string
}

// Command returns a new cobra instance of the RootCMD.
func (r RootCMD) Command() *cobra.Command {
	rootCmd := &cobra.Command{
		Use:   "conduit",
		Short: "Conduit - A volunteer-run proxy relay for the Psiphon network",
		Long: `Conduit is a Psiphon inproxy service that relays traffic for users
in censored regions, helping them access the open internet.

Run 'conduit start' to begin relaying traffic.`,
		Version: r.Version,
	}

	rootCmd.PersistentFlags().CountVarP(&r.verbosity, "verbose", "v", "increase verbosity (-v for verbose, -vv for debug)")
	rootCmd.PersistentFlags().StringVarP(&r.dataDir, "data-dir", "d", "./data", "data directory (stores keys and state)")

	return rootCmd
}

// Verbosity returns the verbosity level (0=normal, 1=verbose, 2+=debug)
func (r RootCMD) Verbosity() int {
	return r.verbosity
}

// GetDataDir returns the data directory path
func (r RootCMD) GetDataDir() string {
	if r.dataDir != "" {
		return r.dataDir
	}

	dir, err := os.Getwd()
	if err != nil {
		return "./data"
	}

	return fmt.Sprintf("%s/data", dir)
}

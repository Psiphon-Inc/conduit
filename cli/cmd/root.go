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

var (
	verbose bool
	dataDir string
	version = "dev"
)

var rootCmd = &cobra.Command{
	Use:   "conduit",
	Short: "Conduit - A volunteer-run proxy relay for the Psiphon network",
	Long: `Conduit is a Psiphon inproxy service that relays traffic for users
in censored regions, helping them access the open internet.

Run 'conduit start' to begin relaying traffic.`,
	Version: version,
}

func Execute() error {
	return rootCmd.Execute()
}

func init() {
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "enable verbose output")
	rootCmd.PersistentFlags().StringVarP(&dataDir, "data-dir", "d", "./data", "data directory (stores keys and state)")
}

// IsVerbose returns whether verbose mode is enabled
func IsVerbose() bool {
	return verbose
}

// GetDataDir returns the data directory path
func GetDataDir() string {
	if dataDir != "" {
		return dataDir
	}
	dir, err := os.Getwd()
	if err != nil {
		return "./data"
	}
	return fmt.Sprintf("%s/data", dir)
}

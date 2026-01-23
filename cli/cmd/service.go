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
	"fmt"

	"github.com/Psiphon-Inc/conduit/cli/internal/service"
	"github.com/spf13/cobra"
)

var serviceCmd = &cobra.Command{
	Use:   "service",
	Short: "Manage Conduit as a system service",
	Long: `Install, uninstall, and manage Conduit as a system service.

Supported platforms:
  - Linux (systemd)
  - macOS (launchd)
  - Windows (Windows Service)`,
}

var serviceInstallCmd = &cobra.Command{
	Use:   "install",
	Short: "Install Conduit as a system service",
	Long: `Install Conduit as a system service that starts automatically on boot.

On Linux and macOS, this requires root/sudo privileges.
On Windows, this requires Administrator privileges.`,
	RunE: runServiceInstall,
}

var serviceUninstallCmd = &cobra.Command{
	Use:   "uninstall",
	Short: "Uninstall the Conduit system service",
	RunE:  runServiceUninstall,
}

var serviceStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Start the Conduit service",
	RunE:  runServiceStart,
}

var serviceStopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop the Conduit service",
	RunE:  runServiceStop,
}

var serviceStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show Conduit service status",
	Long: `Show the current status of the Conduit service.

Use --follow (-f) to watch live statistics.`,
	RunE: runServiceStatus,
}

var serviceLogsCmd = &cobra.Command{
	Use:   "logs",
	Short: "View Conduit service logs",
	RunE:  runServiceLogs,
}

// Service install flags
var (
	svcMaxClients        int
	svcBandwidthMbps     float64
	svcPsiphonConfigPath string
	svcStatusFollow      bool
)

func init() {
	rootCmd.AddCommand(serviceCmd)
	serviceCmd.AddCommand(serviceInstallCmd)
	serviceCmd.AddCommand(serviceUninstallCmd)
	serviceCmd.AddCommand(serviceStartCmd)
	serviceCmd.AddCommand(serviceStopCmd)
	serviceCmd.AddCommand(serviceStatusCmd)
	serviceCmd.AddCommand(serviceLogsCmd)

	// Install flags
	serviceInstallCmd.Flags().IntVarP(&svcMaxClients, "max-clients", "m", 200, "maximum number of proxy clients")
	serviceInstallCmd.Flags().Float64VarP(&svcBandwidthMbps, "bandwidth", "b", 5, "bandwidth limit per peer in Mbps")
	serviceInstallCmd.Flags().StringVarP(&svcPsiphonConfigPath, "psiphon-config", "c", "", "path to Psiphon network config file")

	// Status flags
	serviceStatusCmd.Flags().BoolVarP(&svcStatusFollow, "follow", "f", false, "watch live statistics")
}

func getServiceManager() (service.Manager, error) {
	return service.NewManager()
}

func runServiceInstall(cmd *cobra.Command, args []string) error {
	mgr, err := getServiceManager()
	if err != nil {
		return err
	}

	opts := service.InstallOptions{
		MaxClients:        svcMaxClients,
		BandwidthMbps:     svcBandwidthMbps,
		PsiphonConfigPath: svcPsiphonConfigPath,
		Verbose:           IsVerbose(),
	}

	if err := mgr.Install(opts); err != nil {
		return fmt.Errorf("failed to install service: %w", err)
	}

	fmt.Println("Service installed successfully.")
	fmt.Println("Use 'conduit service start' to start the service.")
	return nil
}

func runServiceUninstall(cmd *cobra.Command, args []string) error {
	mgr, err := getServiceManager()
	if err != nil {
		return err
	}

	if err := mgr.Uninstall(); err != nil {
		return fmt.Errorf("failed to uninstall service: %w", err)
	}

	fmt.Println("Service uninstalled successfully.")
	return nil
}

func runServiceStart(cmd *cobra.Command, args []string) error {
	mgr, err := getServiceManager()
	if err != nil {
		return err
	}

	if err := mgr.Start(); err != nil {
		return fmt.Errorf("failed to start service: %w", err)
	}

	fmt.Println("Service started.")
	return nil
}

func runServiceStop(cmd *cobra.Command, args []string) error {
	mgr, err := getServiceManager()
	if err != nil {
		return err
	}

	if err := mgr.Stop(); err != nil {
		return fmt.Errorf("failed to stop service: %w", err)
	}

	fmt.Println("Service stopped.")
	return nil
}

func runServiceStatus(cmd *cobra.Command, args []string) error {
	mgr, err := getServiceManager()
	if err != nil {
		return err
	}

	if svcStatusFollow {
		return mgr.StatusFollow()
	}

	status, err := mgr.Status()
	if err != nil {
		return fmt.Errorf("failed to get service status: %w", err)
	}

	fmt.Println(status)
	return nil
}

func runServiceLogs(cmd *cobra.Command, args []string) error {
	mgr, err := getServiceManager()
	if err != nil {
		return err
	}

	return mgr.Logs()
}

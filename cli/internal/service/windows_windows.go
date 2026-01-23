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

package service

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/eventlog"
	"golang.org/x/sys/windows/svc/mgr"
)

type windowsManager struct {
	dataDir string
	logPath string
}

// NewManager returns a Windows service manager.
func NewManager() (Manager, error) {
	return NewWindowsManager()
}

// NewWindowsManager creates a new Windows service manager.
func NewWindowsManager() (Manager, error) {
	programData := os.Getenv("ProgramData")
	if programData == "" {
		programData = `C:\ProgramData`
	}
	dataDir := filepath.Join(programData, "Conduit")
	logPath := filepath.Join(dataDir, "conduit.log")

	return &windowsManager{
		dataDir: dataDir,
		logPath: logPath,
	}, nil
}

func (m *windowsManager) Install(opts InstallOptions) error {
	// Get executable path
	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}
	execPath, err = filepath.Abs(execPath)
	if err != nil {
		return fmt.Errorf("failed to get absolute path: %w", err)
	}

	// Build service arguments
	args := []string{"service", "run"}
	if opts.PsiphonConfigPath != "" {
		absConfig, err := filepath.Abs(opts.PsiphonConfigPath)
		if err != nil {
			return fmt.Errorf("failed to get absolute config path: %w", err)
		}
		args = append(args, "--psiphon-config", absConfig)
	}
	if opts.MaxClients > 0 {
		args = append(args, "--max-clients", fmt.Sprintf("%d", opts.MaxClients))
	}
	if opts.BandwidthMbps > 0 {
		args = append(args, "--bandwidth", fmt.Sprintf("%.1f", opts.BandwidthMbps))
	}
	if opts.Verbose {
		args = append(args, "--verbose")
	}
	args = append(args, "--data-dir", m.dataDir)

	// Create data directory
	if err := os.MkdirAll(m.dataDir, 0755); err != nil {
		return fmt.Errorf("failed to create data directory: %w", err)
	}

	// Connect to service manager
	scm, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("failed to connect to service manager (run as Administrator): %w", err)
	}
	defer scm.Disconnect()

	// Check if service already exists
	s, err := scm.OpenService(ServiceName)
	if err == nil {
		s.Close()
		return fmt.Errorf("service already exists, uninstall first")
	}

	// Create service
	config := mgr.Config{
		DisplayName:  ServiceDisplayName,
		Description:  ServiceDescription,
		StartType:    mgr.StartAutomatic,
		ErrorControl: mgr.ErrorNormal,
	}

	s, err = scm.CreateService(ServiceName, execPath, config, args...)
	if err != nil {
		return fmt.Errorf("failed to create service: %w", err)
	}
	defer s.Close()

	// Set recovery actions (restart on failure)
	recoveryActions := []mgr.RecoveryAction{
		{Type: mgr.ServiceRestart, Delay: 5 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 10 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 30 * time.Second},
	}
	if err := s.SetRecoveryActions(recoveryActions, 3600); err != nil {
		// Non-fatal, just log
		fmt.Printf("Warning: failed to set recovery actions: %v\n", err)
	}

	// Create event log source
	if err := eventlog.InstallAsEventCreate(ServiceName, eventlog.Error|eventlog.Warning|eventlog.Info); err != nil {
		// Non-fatal
		fmt.Printf("Warning: failed to create event log source: %v\n", err)
	}

	return nil
}

func (m *windowsManager) Uninstall() error {
	// Connect to service manager
	scm, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("failed to connect to service manager (run as Administrator): %w", err)
	}
	defer scm.Disconnect()

	// Open service
	s, err := scm.OpenService(ServiceName)
	if err != nil {
		return fmt.Errorf("service not found: %w", err)
	}
	defer s.Close()

	// Stop service if running
	status, err := s.Query()
	if err == nil && status.State != svc.Stopped {
		_, _ = s.Control(svc.Stop)
		// Wait for stop
		for i := 0; i < 30; i++ {
			status, err = s.Query()
			if err != nil || status.State == svc.Stopped {
				break
			}
			time.Sleep(time.Second)
		}
	}

	// Delete service
	if err := s.Delete(); err != nil {
		return fmt.Errorf("failed to delete service: %w", err)
	}

	// Remove event log source
	_ = eventlog.Remove(ServiceName)

	return nil
}

func (m *windowsManager) Start() error {
	scm, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("failed to connect to service manager: %w", err)
	}
	defer scm.Disconnect()

	s, err := scm.OpenService(ServiceName)
	if err != nil {
		return fmt.Errorf("failed to open service: %w", err)
	}
	defer s.Close()

	if err := s.Start(); err != nil {
		return fmt.Errorf("failed to start service: %w", err)
	}

	return nil
}

func (m *windowsManager) Stop() error {
	scm, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("failed to connect to service manager: %w", err)
	}
	defer scm.Disconnect()

	s, err := scm.OpenService(ServiceName)
	if err != nil {
		return fmt.Errorf("failed to open service: %w", err)
	}
	defer s.Close()

	status, err := s.Control(svc.Stop)
	if err != nil {
		return fmt.Errorf("failed to stop service: %w", err)
	}

	// Wait for stop
	for status.State != svc.Stopped {
		time.Sleep(time.Second)
		status, err = s.Query()
		if err != nil {
			return fmt.Errorf("failed to query service status: %w", err)
		}
	}

	return nil
}

func (m *windowsManager) Status() (string, error) {
	scm, err := mgr.Connect()
	if err != nil {
		return "", fmt.Errorf("failed to connect to service manager: %w", err)
	}
	defer scm.Disconnect()

	s, err := scm.OpenService(ServiceName)
	if err != nil {
		return "Service not installed.", nil
	}
	defer s.Close()

	status, err := s.Query()
	if err != nil {
		return "", fmt.Errorf("failed to query service: %w", err)
	}

	stateStr := "Unknown"
	switch status.State {
	case svc.Stopped:
		stateStr = "Stopped"
	case svc.StartPending:
		stateStr = "Starting"
	case svc.StopPending:
		stateStr = "Stopping"
	case svc.Running:
		stateStr = "Running"
	case svc.ContinuePending:
		stateStr = "Resuming"
	case svc.PausePending:
		stateStr = "Pausing"
	case svc.Paused:
		stateStr = "Paused"
	}

	var sb strings.Builder
	sb.WriteString("┌─────────────────────────────────────────────────┐\n")
	sb.WriteString("│             CONDUIT SERVICE STATUS              │\n")
	sb.WriteString("└─────────────────────────────────────────────────┘\n")
	sb.WriteString("\n")
	sb.WriteString(fmt.Sprintf("  Status:  %s\n", stateStr))
	if status.ProcessId > 0 {
		sb.WriteString(fmt.Sprintf("  PID:     %d\n", status.ProcessId))
	}
	sb.WriteString(fmt.Sprintf("  Log:     %s\n", m.logPath))
	sb.WriteString("\n")

	if status.State == svc.Running {
		sb.WriteString("  Use 'conduit service status -f' for live statistics\n")
	} else {
		sb.WriteString("  Use 'conduit service start' to start the service\n")
	}

	return sb.String(), nil
}

func (m *windowsManager) StatusFollow() error {
	// Check if log file exists
	if _, err := os.Stat(m.logPath); os.IsNotExist(err) {
		return fmt.Errorf("service is not running or log file not found")
	}

	// Get service config to extract max-clients and bandwidth, and process start time
	maxClients := "200"
	bandwidth := "5"
	var serviceStartTime time.Time

	scm, err := mgr.Connect()
	if err == nil {
		defer scm.Disconnect()
		s, err := scm.OpenService(ServiceName)
		if err == nil {
			defer s.Close()
			cfg, err := s.Config()
			if err == nil {
				cmdLine := cfg.BinaryPathName
				if idx := strings.Index(cmdLine, "--max-clients "); idx != -1 {
					part := cmdLine[idx+14:]
					fmt.Sscanf(part, "%s", &maxClients)
				}
				if idx := strings.Index(cmdLine, "--bandwidth "); idx != -1 {
					part := cmdLine[idx+12:]
					fmt.Sscanf(part, "%s", &bandwidth)
				}
			}
			// Get process start time via status
			status, err := s.Query()
			if err == nil && status.ProcessId > 0 {
				// Use PowerShell to get process start time
				psCmd := exec.Command("powershell", "-Command",
					fmt.Sprintf("(Get-Process -Id %d).StartTime.ToString('o')", status.ProcessId))
				psOutput, err := psCmd.Output()
				if err == nil {
					startTimeStr := strings.TrimSpace(string(psOutput))
					if t, err := time.Parse(time.RFC3339, startTimeStr); err == nil {
						serviceStartTime = t
					}
				}
			}
		}
	}

	fmt.Println("┌─────────────────────────────────────────────────┐")
	fmt.Println("│           CONDUIT LIVE STATISTICS               │")
	fmt.Println("└─────────────────────────────────────────────────┘")
	fmt.Println()
	fmt.Printf("  Max Clients:  %s\n", maxClients)
	fmt.Printf("  Bandwidth:    %s Mbps\n", bandwidth)
	fmt.Println()
	fmt.Println("  Press Ctrl+C to exit")
	fmt.Println()
	// Print placeholder lines for the updating stats
	fmt.Println("  Status:    ...")
	fmt.Println("  Clients:   ...")
	fmt.Println("  Upload:    ...")
	fmt.Println("  Download:  ...")
	fmt.Println("  Uptime:    ...")

	// Stream log file using PowerShell and parse stats
	cmd := exec.Command("powershell", "-Command",
		fmt.Sprintf("Get-Content -Path '%s' -Wait -Tail 100", m.logPath))
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to get log stream: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start log stream: %w", err)
	}

	return DisplayLiveStats(stdout, "", serviceStartTime)
}

func (m *windowsManager) Logs() error {
	// Check if log file exists
	if _, err := os.Stat(m.logPath); os.IsNotExist(err) {
		// Try to show Windows Event Log instead
		fmt.Println("Log file not found. Showing Windows Event Log:")
		cmd := exec.Command("powershell", "-Command",
			fmt.Sprintf("Get-EventLog -LogName Application -Source %s -Newest 50 | Format-Table -AutoSize", ServiceName))
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}

	// Tail the log file using PowerShell
	cmd := exec.Command("powershell", "-Command",
		fmt.Sprintf("Get-Content -Path '%s' -Wait -Tail 100", m.logPath))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

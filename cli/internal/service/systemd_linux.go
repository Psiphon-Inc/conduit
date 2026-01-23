//go:build linux

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
	"text/template"
	"time"
)

const systemdServiceTemplate = `[Unit]
Description={{.Description}}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart={{.ExecStart}}
Restart=always
RestartSec=10
User={{.User}}
Group={{.Group}}
WorkingDirectory={{.WorkingDirectory}}

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths={{.DataDir}}
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`

type systemdManager struct {
	servicePath string
}

// NewManager returns a systemd service manager for Linux.
func NewManager() (Manager, error) {
	return NewSystemdManager()
}

// NewSystemdManager creates a new systemd service manager.
func NewSystemdManager() (Manager, error) {
	return &systemdManager{
		servicePath: "/etc/systemd/system/conduit.service",
	}, nil
}

func (m *systemdManager) Install(opts InstallOptions) error {
	// Check for root privileges
	if os.Geteuid() != 0 {
		return fmt.Errorf("root privileges required: run with sudo")
	}

	// Get the executable path
	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}
	execPath, err = filepath.Abs(execPath)
	if err != nil {
		return fmt.Errorf("failed to get absolute path: %w", err)
	}

	// Build the command line
	args := []string{"start"}
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

	dataDir := "/var/lib/conduit"
	args = append(args, "--data-dir", dataDir)

	// Create data directory
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return fmt.Errorf("failed to create data directory: %w", err)
	}

	// Get current user info for service
	user := "root"
	group := "root"

	data := struct {
		Description      string
		ExecStart        string
		User             string
		Group            string
		WorkingDirectory string
		DataDir          string
	}{
		Description:      ServiceDescription,
		ExecStart:        execPath + " " + strings.Join(args, " "),
		User:             user,
		Group:            group,
		WorkingDirectory: filepath.Dir(execPath),
		DataDir:          dataDir,
	}

	// Generate service file
	tmpl, err := template.New("service").Parse(systemdServiceTemplate)
	if err != nil {
		return fmt.Errorf("failed to parse template: %w", err)
	}

	f, err := os.Create(m.servicePath)
	if err != nil {
		return fmt.Errorf("failed to create service file: %w", err)
	}
	defer f.Close()

	if err := tmpl.Execute(f, data); err != nil {
		return fmt.Errorf("failed to write service file: %w", err)
	}

	// Reload systemd
	if err := exec.Command("systemctl", "daemon-reload").Run(); err != nil {
		return fmt.Errorf("failed to reload systemd: %w", err)
	}

	// Enable service
	if err := exec.Command("systemctl", "enable", ServiceName).Run(); err != nil {
		return fmt.Errorf("failed to enable service: %w", err)
	}

	return nil
}

func (m *systemdManager) Uninstall() error {
	if os.Geteuid() != 0 {
		return fmt.Errorf("root privileges required: run with sudo")
	}

	// Stop service if running
	_ = exec.Command("systemctl", "stop", ServiceName).Run()

	// Disable service
	_ = exec.Command("systemctl", "disable", ServiceName).Run()

	// Remove service file
	if err := os.Remove(m.servicePath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove service file: %w", err)
	}

	// Reload systemd
	if err := exec.Command("systemctl", "daemon-reload").Run(); err != nil {
		return fmt.Errorf("failed to reload systemd: %w", err)
	}

	return nil
}

func (m *systemdManager) Start() error {
	if os.Geteuid() != 0 {
		return fmt.Errorf("root privileges required: run with sudo")
	}

	cmd := exec.Command("systemctl", "start", ServiceName)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func (m *systemdManager) Stop() error {
	if os.Geteuid() != 0 {
		return fmt.Errorf("root privileges required: run with sudo")
	}

	cmd := exec.Command("systemctl", "stop", ServiceName)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func (m *systemdManager) Status() (string, error) {
	// Get basic status info
	cmd := exec.Command("systemctl", "show", ServiceName, "--property=ActiveState,MainPID,ExecMainStartTimestamp")
	output, err := cmd.Output()
	if err != nil {
		return "Service not installed.", nil
	}

	props := make(map[string]string)
	for _, line := range strings.Split(string(output), "\n") {
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			props[parts[0]] = parts[1]
		}
	}

	running := props["ActiveState"] == "active"
	pid := 0
	fmt.Sscanf(props["MainPID"], "%d", &pid)

	var sb strings.Builder
	sb.WriteString("┌─────────────────────────────────────────────────┐\n")
	sb.WriteString("│             CONDUIT SERVICE STATUS              │\n")
	sb.WriteString("└─────────────────────────────────────────────────┘\n")
	sb.WriteString("\n")

	if running {
		sb.WriteString("  Status:  Running\n")
		if pid > 0 {
			sb.WriteString(fmt.Sprintf("  PID:     %d\n", pid))
		}
		sb.WriteString("\n")
		sb.WriteString("  Use 'conduit service status -f' for live statistics\n")
	} else {
		sb.WriteString("  Status:  Stopped\n")
		sb.WriteString("\n")
		sb.WriteString("  Use 'conduit service start' to start the service\n")
	}

	return sb.String(), nil
}

func (m *systemdManager) StatusFollow() error {
	// First check if service is running
	cmd := exec.Command("systemctl", "is-active", ServiceName)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("service is not running")
	}

	// Get service start time from systemd
	var serviceStartTime time.Time
	timestampCmd := exec.Command("systemctl", "show", ServiceName, "--property=ExecMainStartTimestamp")
	timestampOutput, err := timestampCmd.Output()
	if err == nil {
		// Parse: ExecMainStartTimestamp=Thu 2026-01-23 15:30:45 PST
		line := strings.TrimSpace(string(timestampOutput))
		if strings.HasPrefix(line, "ExecMainStartTimestamp=") {
			timestampStr := strings.TrimPrefix(line, "ExecMainStartTimestamp=")
			// Try parsing systemd timestamp format
			// Format: "Thu 2026-01-23 15:30:45 PST"
			if t, err := time.Parse("Mon 2006-01-02 15:04:05 MST", timestampStr); err == nil {
				serviceStartTime = t
			}
		}
	}

	// Get ExecStart to extract config
	execCmd := exec.Command("systemctl", "show", ServiceName, "--property=ExecStart")
	output, _ := execCmd.Output()
	execStart := string(output)

	// Parse max-clients and bandwidth from command line
	maxClients := "200"
	bandwidth := "5"
	if idx := strings.Index(execStart, "--max-clients "); idx != -1 {
		part := execStart[idx+14:]
		fmt.Sscanf(part, "%s", &maxClients)
	}
	if idx := strings.Index(execStart, "--bandwidth "); idx != -1 {
		part := execStart[idx+12:]
		fmt.Sscanf(part, "%s", &bandwidth)
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

	// Stream logs and parse stats
	logCmd := exec.Command("journalctl", "-u", ServiceName, "-f", "--no-pager", "-o", "cat")
	stdout, err := logCmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to get log stream: %w", err)
	}

	if err := logCmd.Start(); err != nil {
		return fmt.Errorf("failed to start log stream: %w", err)
	}

	return DisplayLiveStats(stdout, "", serviceStartTime)
}

func (m *systemdManager) Logs() error {
	cmd := exec.Command("journalctl", "-u", ServiceName, "-f", "--no-pager")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

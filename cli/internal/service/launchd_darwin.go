//go:build darwin

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
	"strconv"
	"strings"
	"text/template"
	"time"
)

const launchdPlistTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{{.Label}}</string>
    <key>ProgramArguments</key>
    <array>
        {{- range .ProgramArguments}}
        <string>{{.}}</string>
        {{- end}}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>{{.WorkingDirectory}}</string>
    <key>StandardOutPath</key>
    <string>{{.LogPath}}</string>
    <key>StandardErrorPath</key>
    <string>{{.LogPath}}</string>
</dict>
</plist>
`

const launchdLabel = "com.psiphon.conduit"

type launchdManager struct {
	plistPath string
	logPath   string
	dataDir   string
}

// NewManager returns a launchd service manager for macOS.
func NewManager() (Manager, error) {
	return NewLaunchdManager()
}

// NewLaunchdManager creates a new launchd service manager.
func NewLaunchdManager() (Manager, error) {
	// Use system-wide LaunchDaemons if root, otherwise user LaunchAgents
	var plistPath, logPath, dataDir string
	if os.Geteuid() == 0 {
		plistPath = "/Library/LaunchDaemons/com.psiphon.conduit.plist"
		logPath = "/var/log/conduit.log"
		dataDir = "/var/lib/conduit"
	} else {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("failed to get home directory: %w", err)
		}
		plistPath = filepath.Join(homeDir, "Library/LaunchAgents/com.psiphon.conduit.plist")
		logPath = filepath.Join(homeDir, "Library/Logs/conduit.log")
		dataDir = filepath.Join(homeDir, ".conduit")
	}

	return &launchdManager{
		plistPath: plistPath,
		logPath:   logPath,
		dataDir:   dataDir,
	}, nil
}

func (m *launchdManager) Install(opts InstallOptions) error {
	// Get the executable path
	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}
	execPath, err = filepath.Abs(execPath)
	if err != nil {
		return fmt.Errorf("failed to get absolute path: %w", err)
	}

	// Build program arguments
	args := []string{execPath, "start"}
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

	// Ensure parent directory exists for plist
	if err := os.MkdirAll(filepath.Dir(m.plistPath), 0755); err != nil {
		return fmt.Errorf("failed to create LaunchAgents directory: %w", err)
	}

	data := struct {
		Label            string
		ProgramArguments []string
		WorkingDirectory string
		LogPath          string
	}{
		Label:            launchdLabel,
		ProgramArguments: args,
		WorkingDirectory: filepath.Dir(execPath),
		LogPath:          m.logPath,
	}

	// Generate plist file
	tmpl, err := template.New("plist").Parse(launchdPlistTemplate)
	if err != nil {
		return fmt.Errorf("failed to parse template: %w", err)
	}

	f, err := os.Create(m.plistPath)
	if err != nil {
		return fmt.Errorf("failed to create plist file: %w", err)
	}
	defer f.Close()

	if err := tmpl.Execute(f, data); err != nil {
		return fmt.Errorf("failed to write plist file: %w", err)
	}

	return nil
}

func (m *launchdManager) Uninstall() error {
	// Unload service if loaded
	_ = exec.Command("launchctl", "unload", m.plistPath).Run()

	// Remove plist file
	if err := os.Remove(m.plistPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove plist file: %w", err)
	}

	return nil
}

func (m *launchdManager) Start() error {
	cmd := exec.Command("launchctl", "load", m.plistPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to load service: %w", err)
	}
	return nil
}

func (m *launchdManager) Stop() error {
	cmd := exec.Command("launchctl", "unload", m.plistPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func (m *launchdManager) Status() (string, error) {
	cmd := exec.Command("launchctl", "list", launchdLabel)
	output, err := cmd.CombinedOutput()

	var sb strings.Builder
	sb.WriteString("┌─────────────────────────────────────────────────┐\n")
	sb.WriteString("│             CONDUIT SERVICE STATUS              │\n")
	sb.WriteString("└─────────────────────────────────────────────────┘\n")
	sb.WriteString("\n")

	if err != nil {
		sb.WriteString("  Status:  Stopped\n")
		sb.WriteString(fmt.Sprintf("  Plist:   %s\n", m.plistPath))
		sb.WriteString("\n")
		sb.WriteString("  Use 'conduit service start' to start the service\n")
	} else {
		// Parse PID from launchctl output
		lines := strings.Split(string(output), "\n")
		pid := ""
		for _, line := range lines {
			if strings.Contains(line, "PID") {
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					pid = parts[len(parts)-1]
				}
			}
		}
		sb.WriteString("  Status:  Running\n")
		if pid != "" && pid != "-" {
			sb.WriteString(fmt.Sprintf("  PID:     %s\n", pid))
		}
		sb.WriteString(fmt.Sprintf("  Log:     %s\n", m.logPath))
		sb.WriteString("\n")
		sb.WriteString("  Use 'conduit service status -f' for live statistics\n")
	}

	return sb.String(), nil
}

func (m *launchdManager) StatusFollow() error {
	// Check if log file exists
	if _, err := os.Stat(m.logPath); os.IsNotExist(err) {
		return fmt.Errorf("service is not running or log file not found")
	}

	// Get the PID and process start time
	var serviceStartTime time.Time
	cmd := exec.Command("launchctl", "list", launchdLabel)
	output, err := cmd.CombinedOutput()
	if err == nil {
		// Parse PID from launchctl output
		lines := strings.Split(string(output), "\n")
		for _, line := range lines {
			if strings.Contains(line, "PID") {
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					pidStr := parts[len(parts)-1]
					if pid, err := strconv.Atoi(pidStr); err == nil && pid > 0 {
						// Get process start time using ps
						psCmd := exec.Command("ps", "-p", pidStr, "-o", "lstart=")
						psOutput, err := psCmd.Output()
						if err == nil {
							// Parse the lstart format: "Mon Jan 23 15:30:45 2026"
							lstartStr := strings.TrimSpace(string(psOutput))
							if t, err := time.Parse("Mon Jan 2 15:04:05 2006", lstartStr); err == nil {
								serviceStartTime = t
							}
						}
					}
				}
			}
		}
	}

	// Try to read plist to get config
	maxClients := "200"
	bandwidth := "5"
	if data, err := os.ReadFile(m.plistPath); err == nil {
		content := string(data)
		if idx := strings.Index(content, "--max-clients"); idx != -1 {
			// Find the next <string> tag
			part := content[idx:]
			if endIdx := strings.Index(part, "</string>"); endIdx != -1 {
				subPart := part[:endIdx]
				if startIdx := strings.LastIndex(subPart, ">"); startIdx != -1 {
					maxClients = strings.TrimSpace(subPart[startIdx+1:])
				}
			}
		}
		if idx := strings.Index(content, "--bandwidth"); idx != -1 {
			part := content[idx:]
			if endIdx := strings.Index(part, "</string>"); endIdx != -1 {
				subPart := part[:endIdx]
				if startIdx := strings.LastIndex(subPart, ">"); startIdx != -1 {
					bandwidth = strings.TrimSpace(subPart[startIdx+1:])
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

	// Stream log file and parse stats
	tailCmd := exec.Command("tail", "-f", m.logPath)
	stdout, err := tailCmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to get log stream: %w", err)
	}

	if err := tailCmd.Start(); err != nil {
		return fmt.Errorf("failed to start log stream: %w", err)
	}

	return DisplayLiveStats(stdout, "", serviceStartTime)
}

func (m *launchdManager) Logs() error {
	// Check if log file exists
	if _, err := os.Stat(m.logPath); os.IsNotExist(err) {
		return fmt.Errorf("log file not found: %s", m.logPath)
	}

	cmd := exec.Command("tail", "-f", m.logPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

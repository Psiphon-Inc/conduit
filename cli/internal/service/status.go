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
	"bufio"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"golang.org/x/term"
)

// Stats holds parsed service statistics.
type Stats struct {
	Clients   string
	Upload    string
	Download  string
	Uptime    string
	Connected bool
}

// statsPattern matches: [STATS] Clients: 0 | Up: 0 B | Down: 0 B | Uptime: 1s
var statsPattern = regexp.MustCompile(`\[STATS\] Clients: (\S+) \| Up: ([^|]+)\| Down: ([^|]+)\| Uptime: (\S+)`)

// ParseStatsLine parses a log line for stats information.
func ParseStatsLine(line string) *Stats {
	if matches := statsPattern.FindStringSubmatch(line); matches != nil {
		return &Stats{
			Clients:  matches[1],
			Upload:   strings.TrimSpace(matches[2]),
			Download: strings.TrimSpace(matches[3]),
			Uptime:   matches[4],
		}
	}
	return nil
}

// IsConnectedLine checks if the line indicates successful connection.
func IsConnectedLine(line string) bool {
	return strings.Contains(line, "[OK] Connected to Psiphon network")
}

// parseUptime parses an uptime string like "5m23s" or "1h2m3s" into a duration.
func parseUptime(s string) (time.Duration, error) {
	// Handle formats: "5s", "2m5s", "1h2m3s"
	return time.ParseDuration(s)
}

// formatDuration formats a duration in a human-readable way.
func formatDuration(d time.Duration) string {
	d = d.Round(time.Second)
	h := d / time.Hour
	d -= h * time.Hour
	m := d / time.Minute
	d -= m * time.Minute
	s := d / time.Second

	if h > 0 {
		return fmt.Sprintf("%dh%dm%ds", h, m, s)
	}
	if m > 0 {
		return fmt.Sprintf("%dm%ds", m, s)
	}
	return fmt.Sprintf("%ds", s)
}

// DisplayLiveStats reads from a reader and displays live stats with real-time uptime.
// If serviceStartTime is provided (non-zero), it will be used to calculate uptime.
// Otherwise, uptime will be derived from the first [STATS] log line received.
func DisplayLiveStats(r io.Reader, initialStatus string, serviceStartTime time.Time) error {
	isTTY := term.IsTerminal(int(os.Stdout.Fd()))

	// Print initial status header
	if initialStatus != "" {
		fmt.Println(initialStatus)
		fmt.Println()
	}

	var mu sync.Mutex
	var lastStats *Stats
	startTime := serviceStartTime // Use provided start time or derive from logs
	connected := false

	// Goroutine to read log lines
	go func() {
		scanner := bufio.NewScanner(r)
		for scanner.Scan() {
			line := scanner.Text()

			mu.Lock()
			// Check for connection status
			if IsConnectedLine(line) {
				connected = true
			}

			// Parse stats
			if stats := ParseStatsLine(line); stats != nil {
				stats.Connected = connected
				lastStats = stats

				// Calculate service start time from first stats line (if not already known)
				if startTime.IsZero() {
					if uptime, err := parseUptime(stats.Uptime); err == nil {
						startTime = time.Now().Add(-uptime)
					}
				}
			}
			mu.Unlock()
		}
	}()

	// Main display loop - update every second
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for range ticker.C {
		mu.Lock()
		status := "Waiting"
		if connected {
			status = "Connected"
		}

		clients := "0"
		upload := "0 B"
		download := "0 B"
		uptime := "..."
		if lastStats != nil {
			clients = lastStats.Clients
			upload = lastStats.Upload
			download = lastStats.Download
		}
		// Calculate uptime dynamically from service start time
		if !startTime.IsZero() {
			uptime = formatDuration(time.Since(startTime))
		}
		mu.Unlock()

		if isTTY {
			// Move cursor up 5 lines to overwrite previous stats
			fmt.Print("\033[5A")
			// Print stats with padding to overwrite previous content
			fmt.Printf("  Status:    %-20s\n", status)
			fmt.Printf("  Clients:   %-20s\n", clients)
			fmt.Printf("  Upload:    %-20s\n", upload)
			fmt.Printf("  Download:  %-20s\n", download)
			fmt.Printf("  Uptime:    %-20s\n", uptime)
		} else {
			fmt.Printf("Clients: %s | Up: %s | Down: %s | Uptime: %s\n",
				clients, upload, download, uptime)
		}
	}

	return nil
}

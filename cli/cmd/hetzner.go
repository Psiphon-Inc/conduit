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
	"bufio"
	"context"
	"fmt"
	"os"
	"os/signal"
	"sort"
	"strconv"
	"strings"
	"sync"
	"text/tabwriter"
	"time"

	"github.com/Psiphon-Inc/conduit/cli/internal/config"
	"github.com/Psiphon-Inc/conduit/cli/internal/hetzner"
	"github.com/hetznercloud/hcloud-go/hcloud"
	"github.com/spf13/cobra"
)

var hetznerSetupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Provision Conduit servers on Hetzner Cloud",
	Long: `Interactive setup: create Hetzner Cloud servers and run Conduit on them.

Use a Hetzner API token from the project where you want servers. If you have
a project named "Conduit", use that project's token; otherwise create a project
in the Hetzner Cloud Console and use its token. This command does not create
or switch projects—it uses whichever project the token belongs to.

You will be prompted for:
  - Hetzner API token (or set HETZNER_API_TOKEN)
  - Number of servers (1–project limit; your current server count is shown)
  - Server type (e.g. cx11, cpx11)
  - Location (optional)
  - Conduit options: max-clients, bandwidth
  - Optional: SSH public key path (for server access)`,
	RunE: runHetznerSetup,
}

var hetznerStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show status of Conduit servers on Hetzner (refreshes every 5s)",
	Long: `List servers whose name starts with "conduit" from your Hetzner project,
fetch metrics from each server (http://<ip>:9090/metrics) every 5 seconds,
and display a live table. Press Ctrl+C to exit.

Requires HETZNER_API_TOKEN or you will be prompted.`,
	RunE: runHetznerStatus,
}

func init() {
	hetznerCmd := &cobra.Command{
		Use:   "hetzner",
		Short: "Hetzner Cloud provisioning for Conduit",
	}
	hetznerCmd.AddCommand(hetznerSetupCmd)
	hetznerCmd.AddCommand(hetznerStatusCmd)
	rootCmd.AddCommand(hetznerCmd)
}

func prompt(reader *bufio.Reader, msg, defaultVal string) (string, error) {
	if defaultVal != "" {
		fmt.Printf("%s [%s]: ", msg, defaultVal)
	} else {
		fmt.Printf("%s: ", msg)
	}
	line, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	line = strings.TrimSpace(line)
	if line == "" && defaultVal != "" {
		return defaultVal, nil
	}
	return line, nil
}

func runHetznerSetup(cmd *cobra.Command, args []string) error {
	ctx := context.Background()
	reader := bufio.NewReader(os.Stdin)

	// API token
	token := os.Getenv("HETZNER_API_TOKEN")
	if token == "" {
		var err error
		token, err = prompt(reader, "Hetzner API token", "")
		if err != nil {
			return err
		}
		if token == "" {
			return fmt.Errorf("API token required; set HETZNER_API_TOKEN or enter it when prompted")
		}
	}

	client := hetzner.NewClient(token)

	// Verify token and list options
	fmt.Println("Checking Hetzner project and listing options...")
	serverTypes, err := client.ListServerTypes(ctx)
	if err != nil {
		return fmt.Errorf("Hetzner API: %w (check token and project)", err)
	}
	locs, err := client.ListLocations(ctx)
	if err != nil {
		return fmt.Errorf("list locations: %w", err)
	}
	var locNames []string
	for _, l := range locs {
		locNames = append(locNames, l.Name)
	}
	fmt.Println("Using the Hetzner project this token belongs to (e.g. create a 'Conduit' project in the console if you want a dedicated one).")
	fmt.Printf("Available locations: %s\n", strings.Join(locNames, ", "))

	// Server count: use project limit as maximum (Hetzner API does not expose limit; we use a sensible max).
	currentCount, err := client.ServerCount(ctx)
	if err != nil {
		return fmt.Errorf("server count: %w", err)
	}
	maxServers := hetzner.MaxServersPerProject
	countPrompt := fmt.Sprintf("How many servers to create (1–%d). You have %d in this project", maxServers, currentCount)
	countStr, err := prompt(reader, countPrompt, "1")
	if err != nil {
		return err
	}
	count, err := strconv.Atoi(countStr)
	if err != nil || count < 1 || count > maxServers {
		return fmt.Errorf("server count must be 1–%d", maxServers)
	}

	// Server type: group by section (name prefix), sort by price within each section, show as table
	activeTypes, err := buildServerTypeTable(serverTypes)
	if err != nil {
		return err
	}
	choiceStr, err := prompt(reader, "Select server type (number or name, e.g. cx11)", "cx11")
	if err != nil {
		return err
	}
	serverTypeName := resolveServerType(activeTypes, strings.TrimSpace(choiceStr))
	if serverTypeName == "" {
		return fmt.Errorf("invalid server type: %s", choiceStr)
	}

	// Location: show numbered list of locations that support the chosen server type
	var locationNames []string
	for _, st := range activeTypes {
		if st.Name == serverTypeName && len(st.Pricings) > 0 {
			for _, p := range st.Pricings {
				if p.Location != nil {
					locationNames = append(locationNames, p.Location.Name)
				}
			}
			break
		}
	}
	if len(locationNames) == 0 {
		return fmt.Errorf("server type %s has no locations", serverTypeName)
	}
	fmt.Printf("\nLocations (for %s):\n", serverTypeName)
	for i, name := range locationNames {
		fmt.Printf("  %2d) %s\n", i+1, name)
	}
	locChoice, err := prompt(reader, "Select location (number or name)", locationNames[0])
	if err != nil {
		return err
	}
	locName := resolveLocation(locationNames, strings.TrimSpace(locChoice))
	if locName == "" {
		return fmt.Errorf("invalid location: %s", locChoice)
	}

	// Conduit config
	maxClientsStr, err := prompt(reader, "Max clients per server", fmt.Sprintf("%d", config.DefaultMaxClients))
	if err != nil {
		return err
	}
	maxClients, err := strconv.Atoi(strings.TrimSpace(maxClientsStr))
	if err != nil || maxClients < 1 || maxClients > config.MaxClientsLimit {
		maxClients = config.DefaultMaxClients
	}

	bandwidthStr, err := prompt(reader, "Bandwidth per server (Mbps, -1 = unlimited)", fmt.Sprintf("%.0f", config.DefaultBandwidthMbps))
	if err != nil {
		return err
	}
	bandwidth, err := strconv.ParseFloat(strings.TrimSpace(bandwidthStr), 64)
	if err != nil || (bandwidth < 1 && bandwidth != -1) {
		bandwidth = config.DefaultBandwidthMbps
	}

	// Optional SSH key
	sshPath, err := prompt(reader, "SSH public key path (optional, for server access)", "")
	if err != nil {
		return err
	}
	sshPath = strings.TrimSpace(sshPath)
	var sshPub string
	if sshPath != "" {
		data, err := os.ReadFile(sshPath)
		if err != nil {
			return fmt.Errorf("read SSH key %s: %w", sshPath, err)
		}
		sshPub = strings.TrimSpace(string(data))
	}

	const progressLineWidth = 120
	reports := make([]hetzner.ProgressReport, count)
	printedCreating := make([]bool, count)
	step1Printed := false
	step2Printed := false
	lastProgressLen := 0
	opts := hetzner.SetupOpts{
		APIToken:      token,
		ServerCount:   count,
		ServerType:    serverTypeName,
		Location:      locName,
		MaxClients:    maxClients,
		BandwidthMbps: bandwidth,
		SSHPublicKey:  sshPub,
		Progress: func(r hetzner.ProgressReport) {
			reports[r.ServerNum-1] = r
			switch r.Phase {
			case hetzner.ProgressCreating:
				if !printedCreating[r.ServerNum-1] {
					printedCreating[r.ServerNum-1] = true
					if !step1Printed {
						step1Printed = true
						fmt.Printf("  Step 1/%d: Creating servers...\n", count)
					}
					fmt.Printf("    [%d/%d] %s: creating server...\n", r.ServerNum, r.Total, r.Name)
				}
			case hetzner.ProgressWaiting, hetzner.ProgressReady:
				if !step2Printed {
					step2Printed = true
					fmt.Printf("  Step 2/%d: Installing Conduit on each server (waiting for metrics)...\n", count)
				}
				// Single line updated in place (DOS-style)
				var parts []string
				for i := 0; i < count; i++ {
					rep := reports[i]
					if rep.Name == "" {
						rep = hetzner.ProgressReport{
							ServerNum: i + 1,
							Total:     count,
							Name:      fmt.Sprintf("conduit-%d", i+1),
							Phase:     hetzner.ProgressCreating,
						}
					}
					switch rep.Phase {
					case hetzner.ProgressCreating:
						parts = append(parts, fmt.Sprintf("[%d/%d] %s: creating", rep.ServerNum, rep.Total, rep.Name))
					case hetzner.ProgressWaiting:
						pct := 0
						if rep.Timeout > 0 {
							pct = int(rep.Elapsed * 100 / rep.Timeout)
							if pct > 100 {
								pct = 100
							}
						}
						parts = append(parts, fmt.Sprintf("[%d/%d] %s: %d%%", rep.ServerNum, rep.Total, rep.Name, pct))
					case hetzner.ProgressReady:
						parts = append(parts, fmt.Sprintf("[%d/%d] %s: ok", rep.ServerNum, rep.Total, rep.Name))
					default:
						parts = append(parts, fmt.Sprintf("[%d/%d] %s: ...", rep.ServerNum, rep.Total, rep.Name))
					}
				}
				line := "  " + strings.Join(parts, "  ")
				if len(line) < lastProgressLen {
					line += strings.Repeat(" ", lastProgressLen-len(line))
				}
				lastProgressLen = len(line)
				fmt.Printf("\r%s", line)
			}
		},
	}

	fmt.Printf("\nCreating %d server(s) (%s) in %s.\n", count, serverTypeName, locName)
	servers, err := client.Setup(ctx, opts)
	if err != nil {
		return err
	}

	fmt.Printf("\n  Step 3/%d: All servers ready.\n\n", count)
	tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "Name\tID\tIPv4\tStatus")
	for _, s := range servers {
		fmt.Fprintf(tw, "%s\t%d\t%s\t%s\n", s.Name, s.ID, s.IPv4, s.Status)
	}
	tw.Flush()
	fmt.Println("\nAll servers are ready. Conduit is running on each.")
	fmt.Println("\nMetrics URL for each server:")
	for _, s := range servers {
		fmt.Printf("  %s (%s): http://%s:9090/metrics\n", s.Name, s.IPv4, s.IPv4)
	}
	return nil
}

// ANSI color codes (no external dependency)
const (
	ansiReset   = "\033[0m"
	ansiBold    = "\033[1m"
	ansiDim     = "\033[2m"
	ansiCyan    = "\033[36m"
	ansiGreen   = "\033[32m"
	ansiYellow  = "\033[33m"
	ansiRed     = "\033[31m"
	ansiMagenta = "\033[35m"
	ansiBlue    = "\033[34m"
	ansiWhite   = "\033[37m"
)

type statusRow struct {
	server  hetzner.ServerInfo
	metrics hetzner.ServerMetrics
}

func renderStatusDashboard(rows []statusRow) {
	fmt.Printf("%s%s  Conduit servers — Hetzner Cloud%s  %s(refresh every 5s, Ctrl+C to exit)%s\n\n", ansiBold, ansiCyan, ansiReset, ansiDim, ansiReset)
	for _, r := range rows {
		renderServerCard(r)
		fmt.Println()
	}
	fmt.Printf("%s────────────────────────────────────────────────────────────────────────────────────────%s\n", ansiDim, ansiReset)
}

func renderServerCard(r statusRow) {
	s := r.server
	m := r.metrics
	// Card header: name + IP
	fmt.Printf("  %s%s┌─ %s %s— %s%s%s\n", ansiCyan, ansiBold, s.Name, ansiReset, ansiDim, s.IPv4, ansiReset)
	if m.Err != "" {
		fmt.Printf("  %s│ %sError: %s%s\n", ansiCyan, ansiRed, m.Err, ansiReset)
		fmt.Printf("  %s└%s  Metrics: %shttp://%s:9090/metrics%s\n", ansiCyan, ansiReset, ansiDim, s.IPv4, ansiReset)
		return
	}
	// Live status
	liveStr := ansiRed + "✗ offline"
	if m.IsLive {
		liveStr = ansiGreen + "✓ live"
	}
	fmt.Printf("  %s│%s  %sBroker: %s%s\n", ansiCyan, ansiReset, ansiBold, liveStr, ansiReset)
	// Conduit metrics
	fmt.Printf("  %s│%s  %sConduit:%s  clients %s%d%s / %s%d%s  uptime %s%s%s  bw %s%s%s\n",
		ansiCyan, ansiReset, ansiYellow, ansiReset,
		ansiWhite, m.ConnectedClients, ansiReset, ansiDim, m.MaxClients, ansiReset,
		ansiWhite, formatDuration(m.UptimeSeconds), ansiReset,
		ansiWhite, formatBandwidth(m.BandwidthLimitBps), ansiReset)
	fmt.Printf("  %s│%s  %sTraffic:%s  ↓ %s%s%s  ↑ %s%s%s  connecting %s%d%s\n",
		ansiCyan, ansiReset, ansiYellow, ansiReset,
		ansiWhite, formatBytes(m.BytesDownloaded), ansiReset, ansiWhite, formatBytes(m.BytesUploaded), ansiReset,
		ansiWhite, m.ConnectingClients, ansiReset)
	// Build
	if m.BuildRev != "" || m.GoVersion != "" {
		fmt.Printf("  %s│%s  %sBuild:%s  rev %s%s%s  %s%s%s\n",
			ansiCyan, ansiReset, ansiYellow, ansiReset,
			ansiDim, m.BuildRev, ansiReset, ansiDim, m.GoVersion, ansiReset)
	}
	// Runtime
	fmt.Printf("  %s│%s  %sRuntime:%s  goroutines %s%d%s  threads %s%d%s  heap %s%s%s  rss %s%s%s\n",
		ansiCyan, ansiReset, ansiYellow, ansiReset,
		ansiWhite, m.GoGoroutines, ansiReset, ansiWhite, m.GoThreads, ansiReset,
		ansiWhite, formatBytes(m.HeapAlloc), ansiReset, ansiWhite, formatBytes(m.ProcessResidentBytes), ansiReset)
	// Process
	fmt.Printf("  %s│%s  %sProcess:%s  cpu %s%.2fs%s  net ↓%s%s%s ↑%s%s%s  fds %s%d%s\n",
		ansiCyan, ansiReset, ansiYellow, ansiReset,
		ansiWhite, m.ProcessCPUSec, ansiReset,
		ansiWhite, formatBytes(m.ProcessNetworkRecv), ansiReset,
		ansiWhite, formatBytes(m.ProcessNetworkTx), ansiReset,
		ansiWhite, m.ProcessOpenFDs, ansiReset)
	fmt.Printf("  %s└%s  %sMetrics:%s %shttp://%s:9090/metrics%s\n", ansiCyan, ansiReset, ansiDim, ansiReset, ansiDim, s.IPv4, ansiReset)
}

func formatBandwidth(bps int64) string {
	if bps <= 0 {
		return "unlimited"
	}
	return formatBytes(bps) + "/s"
}

func runHetznerStatus(cmd *cobra.Command, args []string) error {
	ctx := context.Background()
	reader := bufio.NewReader(os.Stdin)
	token := os.Getenv("HETZNER_API_TOKEN")
	if token == "" {
		var err error
		token, err = prompt(reader, "Hetzner API token", "")
		if err != nil {
			return err
		}
		if token == "" {
			return fmt.Errorf("API token required; set HETZNER_API_TOKEN or enter it when prompted")
		}
	}
	client := hetzner.NewClient(token)
	servers, err := client.ListConduitServers(ctx)
	if err != nil {
		return fmt.Errorf("Hetzner API: %w", err)
	}
	if len(servers) == 0 {
		fmt.Println("No servers with name starting with \"conduit\" found in your Hetzner project.")
		return nil
	}
	// Sort by name (conduit-1, conduit-2, ...)
	sort.Slice(servers, func(i, j int) bool { return servers[i].Name < servers[j].Name })

	// Handle Ctrl+C to exit cleanly
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt)
	defer signal.Stop(sigCh)

	fmt.Println("Conduit servers on Hetzner — refreshing every 5s (Ctrl+C to exit)")
	fmt.Println()

	for {
		// Fetch metrics for all servers in parallel (curl metrics in background)
		rows := make([]statusRow, len(servers))
		var wg sync.WaitGroup
		for i := range servers {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				m, _ := hetzner.FetchMetrics(servers[i].IPv4)
				rows[i] = statusRow{server: servers[i], metrics: m}
			}(i)
		}
		wg.Wait()

		// Clear screen and move cursor home (ANSI)
		fmt.Print("\033[2J\033[H")
		renderStatusDashboard(rows)

		select {
		case <-sigCh:
			fmt.Println("\nExiting.")
			return nil
		case <-time.After(5 * time.Second):
			// continue loop
		}
	}
}

func formatDuration(sec float64) string {
	if sec <= 0 {
		return "-"
	}
	d := time.Duration(sec * float64(time.Second))
	if d < time.Minute {
		return d.Round(time.Second).String()
	}
	if d < time.Hour {
		return d.Round(time.Second).String()
	}
	return d.Round(time.Second).String()
}

func formatBytes(b int64) string {
	if b < 0 {
		return "-"
	}
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

// serverTypeSection returns the name prefix (letters before first digit) for grouping, e.g. "cpx11" -> "cpx".
func serverTypeSection(name string) string {
	for i, r := range name {
		if r >= '0' && r <= '9' {
			return strings.ToUpper(name[:i])
		}
	}
	return strings.ToUpper(name)
}

// serverTypePrice returns the first location's monthly net price as float for sorting; 0 if missing.
func serverTypePrice(st *hcloud.ServerType) float64 {
	if len(st.Pricings) == 0 || st.Pricings[0].Monthly.Net == "" {
		return 0
	}
	f, _ := strconv.ParseFloat(st.Pricings[0].Monthly.Net, 64)
	return f
}

// buildServerTypeTable groups server types by section (name prefix), sorts each section by price,
// prints a table per section, and returns a flat list in display order for selection by number.
func buildServerTypeTable(serverTypes []*hcloud.ServerType) ([]*hcloud.ServerType, error) {
	var active []*hcloud.ServerType
	for _, st := range serverTypes {
		if st.IsDeprecated() {
			continue
		}
		active = append(active, st)
	}
	if len(active) == 0 {
		return nil, fmt.Errorf("no server types available")
	}

	// Group by section (name prefix)
	sections := make(map[string][]*hcloud.ServerType)
	for _, st := range active {
		sec := serverTypeSection(st.Name)
		sections[sec] = append(sections[sec], st)
	}

	// Sort types in each section by price ascending
	var sectionNames []string
	for name := range sections {
		sectionNames = append(sectionNames, name)
		list := sections[name]
		sort.Slice(list, func(i, j int) bool {
			return serverTypePrice(list[i]) < serverTypePrice(list[j])
		})
		sections[name] = list
	}
	// Order section names for display (alphabetically)
	sort.Strings(sectionNames)

	// Print table per section and build flat list in display order
	fmt.Println("\nServer types (by section, sorted by price):")
	var flat []*hcloud.ServerType
	idx := 1
	tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	for _, secName := range sectionNames {
		list := sections[secName]
		fmt.Printf("\n  --- %s ---\n", secName)
		fmt.Fprintln(tw, "#\tName\tvCPUs\tRAM (GB)\tPrice (EUR/mo)")
		for _, st := range list {
			priceStr := "—"
			if p := serverTypePrice(st); p > 0 {
				priceStr = fmt.Sprintf("%.2f", p)
			}
			ramGB := float64(st.Memory) / 1024
			fmt.Fprintf(tw, "%d\t%s\t%d\t%.1f\t%s\n", idx, st.Name, st.Cores, ramGB, priceStr)
			flat = append(flat, st)
			idx++
		}
		tw.Flush()
	}
	fmt.Println()
	return flat, nil
}

func resolveServerType(types []*hcloud.ServerType, choice string) string {
	choice = strings.TrimSpace(strings.ToLower(choice))
	for _, st := range types {
		if st.Name == choice {
			return st.Name
		}
	}
	if n, err := strconv.Atoi(choice); err == nil && n >= 1 && n <= len(types) {
		return types[n-1].Name
	}
	return ""
}

func resolveLocation(names []string, choice string) string {
	choice = strings.TrimSpace(strings.ToLower(choice))
	for _, name := range names {
		if strings.ToLower(name) == choice {
			return name
		}
	}
	if n, err := strconv.Atoi(choice); err == nil && n >= 1 && n <= len(names) {
		return names[n-1]
	}
	return ""
}

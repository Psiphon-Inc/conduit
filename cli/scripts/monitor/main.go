package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	// Minimum values to protect reputation
	MinTrafficLimitGB    = 100
	MinTrafficPeriodDays = 7
	MinThresholdPercent  = 60
	MaxThresholdPercent  = 90
	DefaultThreshold     = 80

	// State file
	StateFileName = "traffic_state.json"

	// HTTP client timeout for metrics scraping
	httpTimeout = 5 * time.Second
)

// httpClient is used for metrics scraping with a timeout
var httpClient = &http.Client{Timeout: httpTimeout}

type TrafficState struct {
	PeriodStartTime time.Time `json:"periodStartTime"`
	BytesUsed       int64     `json:"bytesUsed"`
	IsThrottled     bool      `json:"isThrottled"`
}

type Config struct {
	TrafficLimitGB            float64
	TrafficPeriodDays         int
	BandwidthThresholdPercent int
	MinConnections            int
	MinBandwidthMbps          float64
	DataDir                   string
	MetricsAddr               string
	ConduitArgs               []string
}

func main() {
	cfg := parseFlags()

	if cfg.TrafficLimitGB > 0 {
		if err := validateConfig(cfg); err != nil {
			log.Fatalf("[ERROR] Configuration error: %v", err)
		}
	} else {
		// If no traffic limit, just run conduit directly without monitoring
		log.Println("[INFO] No traffic limit set. Running conduit directly.")
		runConduitDirectly(cfg.ConduitArgs)
		return
	}

	// Ensure data directory exists
	if err := os.MkdirAll(cfg.DataDir, 0700); err != nil {
		log.Fatalf("[ERROR] Failed to create data directory: %v", err)
	}

	supervisor := NewSupervisor(cfg)
	if err := supervisor.Run(); err != nil {
		log.Fatalf("[ERROR] Supervisor failed: %v", err)
	}
}

// looksLikeValue checks if a string looks like a flag value (not a flag itself)
// This handles negative numbers like -5 which start with - but are values
func looksLikeValue(s string) bool {
	if !strings.HasPrefix(s, "-") {
		return true
	}
	// Check if it's a negative number
	_, err := strconv.ParseFloat(s, 64)
	return err == nil
}

// isDataDirFlag checks if arg is specifically the --data-dir or -d flag
func isDataDirFlag(arg string) bool {
	return arg == "--data-dir" || arg == "-d" ||
		strings.HasPrefix(arg, "--data-dir=") || strings.HasPrefix(arg, "-d=")
}

// isMetricsAddrFlag checks if arg is specifically the --metrics-addr flag
func isMetricsAddrFlag(arg string) bool {
	return arg == "--metrics-addr" || strings.HasPrefix(arg, "--metrics-addr=")
}

func parseFlags() *Config {
	cfg := &Config{}

	// Define flags
	flag.Float64Var(&cfg.TrafficLimitGB, "traffic-limit", 0, "Total traffic limit in GB (0 = unlimited)")
	flag.IntVar(&cfg.TrafficPeriodDays, "traffic-period", 0, "Time period in days for traffic limit")
	flag.IntVar(&cfg.BandwidthThresholdPercent, "bandwidth-threshold", DefaultThreshold, "Throttle at this % of quota (60-90%)")
	flag.IntVar(&cfg.MinConnections, "min-connections", 10, "Max clients when throttled")
	flag.Float64Var(&cfg.MinBandwidthMbps, "min-bandwidth", 10, "Bandwidth in Mbps when throttled")
	flag.StringVar(&cfg.DataDir, "data-dir", "./data", "Directory for keys and state")
	flag.StringVar(&cfg.MetricsAddr, "metrics-addr", "127.0.0.1:9090", "Prometheus metrics listen address (required for monitoring)")

	// Parse flags, but keep unknown flags for conduit
	// We use a custom usage function to avoid failing on conduit flags
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: conduit-monitor [monitor flags] -- [conduit flags]\n")
		flag.PrintDefaults()
	}

	args := os.Args[1:]
	monitorArgs := []string{}
	conduitArgs := []string{"start"} // Default command

	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			// Handle args after separator
			rest := args[i+1:]
			// Skip redundant "start" if present (we already have it in conduitArgs)
			if len(rest) > 0 && rest[0] == "start" {
				rest = rest[1:]
			}
			conduitArgs = append(conduitArgs, rest...)
			break
		}

		// Check if it's one of our monitor-only flags
		if strings.HasPrefix(arg, "--traffic-limit") ||
			strings.HasPrefix(arg, "--traffic-period") ||
			strings.HasPrefix(arg, "--bandwidth-threshold") ||
			strings.HasPrefix(arg, "--min-connections") ||
			strings.HasPrefix(arg, "--min-bandwidth") {

			// Add to monitor args to be parsed by flag set
			monitorArgs = append(monitorArgs, arg)
			if !strings.Contains(arg, "=") && i+1 < len(args) && looksLikeValue(args[i+1]) {
				monitorArgs = append(monitorArgs, args[i+1])
				i++
			}
			continue
		}

		// Check for flags we share/need to know about (both monitor and conduit need these)
		// Use exact match to avoid matching -debug, -data, etc.
		if isDataDirFlag(arg) {
			if strings.Contains(arg, "=") {
				// Format: --data-dir=/path or -d=/path
				monitorArgs = append(monitorArgs, arg)
				conduitArgs = append(conduitArgs, arg)
			} else if i+1 < len(args) && looksLikeValue(args[i+1]) {
				// Format: --data-dir /path or -d /path
				monitorArgs = append(monitorArgs, arg, args[i+1])
				conduitArgs = append(conduitArgs, arg, args[i+1])
				i++
			} else {
				// Flag without value - pass through to let conduit report error
				conduitArgs = append(conduitArgs, arg)
			}
			continue
		}
		if isMetricsAddrFlag(arg) {
			if strings.Contains(arg, "=") {
				// Format: --metrics-addr=host:port
				monitorArgs = append(monitorArgs, arg)
				conduitArgs = append(conduitArgs, arg)
			} else if i+1 < len(args) && looksLikeValue(args[i+1]) {
				// Format: --metrics-addr host:port
				monitorArgs = append(monitorArgs, arg, args[i+1])
				conduitArgs = append(conduitArgs, arg, args[i+1])
				i++
			} else {
				// Flag without value - pass through to let conduit report error
				conduitArgs = append(conduitArgs, arg)
			}
			continue
		}

		// Add to conduit args (unknown flags pass through to conduit)
		conduitArgs = append(conduitArgs, arg)
		if !strings.Contains(arg, "=") && i+1 < len(args) && looksLikeValue(args[i+1]) {
			conduitArgs = append(conduitArgs, args[i+1])
			i++
		}
	}

	// Parse our subset of flags
	fs := flag.NewFlagSet("monitor", flag.ContinueOnError)
	fs.Float64Var(&cfg.TrafficLimitGB, "traffic-limit", 0, "")
	fs.IntVar(&cfg.TrafficPeriodDays, "traffic-period", 0, "")
	fs.IntVar(&cfg.BandwidthThresholdPercent, "bandwidth-threshold", DefaultThreshold, "")
	fs.IntVar(&cfg.MinConnections, "min-connections", 10, "")
	fs.Float64Var(&cfg.MinBandwidthMbps, "min-bandwidth", 10, "")
	fs.StringVar(&cfg.DataDir, "data-dir", "./data", "")
	fs.StringVar(&cfg.DataDir, "d", "./data", "") // short flag alias
	fs.StringVar(&cfg.MetricsAddr, "metrics-addr", "127.0.0.1:9090", "")
	fs.Parse(monitorArgs)

	cfg.ConduitArgs = conduitArgs
	return cfg
}

func validateConfig(cfg *Config) error {
	if cfg.TrafficPeriodDays < MinTrafficPeriodDays {
		return fmt.Errorf("traffic-period must be at least %d days", MinTrafficPeriodDays)
	}
	if cfg.TrafficLimitGB < MinTrafficLimitGB {
		return fmt.Errorf("traffic-limit must be at least %d GB", MinTrafficLimitGB)
	}
	if cfg.BandwidthThresholdPercent < MinThresholdPercent || cfg.BandwidthThresholdPercent > MaxThresholdPercent {
		return fmt.Errorf("bandwidth-threshold must be between %d-%d%%", MinThresholdPercent, MaxThresholdPercent)
	}
	if cfg.MinConnections <= 0 {
		return fmt.Errorf("min-connections must be positive")
	}
	if cfg.MinBandwidthMbps <= 0 {
		return fmt.Errorf("min-bandwidth must be positive")
	}
	return nil
}

func runConduitDirectly(args []string) {
	cmd := exec.Command("conduit", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	if err := cmd.Run(); err != nil {
		log.Fatalf("[ERROR] Conduit exited with error: %v", err)
	}
}

type Supervisor struct {
	cfg             *Config
	state           *TrafficState
	stateFile       string
	mu              sync.Mutex
	child           *exec.Cmd
	stopChan        chan struct{}
	restartChan     chan struct{}
	metricsURL      string
	lastScrapeTotal int64 // Track last scraped value to calculate delta
}

func NewSupervisor(cfg *Config) *Supervisor {
	return &Supervisor{
		cfg:         cfg,
		stateFile:   filepath.Join(cfg.DataDir, StateFileName),
		stopChan:    make(chan struct{}),
		restartChan: make(chan struct{}, 1),
		metricsURL:  fmt.Sprintf("http://%s/metrics", cfg.MetricsAddr),
	}
}

func (s *Supervisor) Run() error {
	// Load or initialize state
	if err := s.loadState(); err != nil {
		if os.IsNotExist(err) {
			log.Println("[INFO] No previous state found, starting fresh traffic period")
		} else {
			log.Printf("[WARN] Failed to load state, starting fresh: %v", err)
		}
		s.state = &TrafficState{
			PeriodStartTime: time.Now(),
			BytesUsed:       0,
			IsThrottled:     false,
		}
		if err := s.saveState(); err != nil {
			log.Printf("[WARN] Failed to save initial state: %v", err)
		}
	}

	// Handle signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start monitoring loop
	go s.monitorLoop(ctx)

	// Main loop to manage child process
	for {
		// Check for stop/signal before starting child
		select {
		case <-s.stopChan:
			return nil
		case <-sigChan:
			log.Println("[INFO] Received signal, shutting down...")
			return nil
		default:
		}

		// Prepare conduit arguments based on throttle state
		s.mu.Lock()
		isThrottled := s.state.IsThrottled
		s.mu.Unlock()

		args := make([]string, len(s.cfg.ConduitArgs))
		copy(args, s.cfg.ConduitArgs)

		if isThrottled {
			log.Println("[INFO] Starting Conduit in THROTTLED mode")
			// Override flags for throttling
			args = filterArgs(args, "--max-clients", "-m")
			args = filterArgs(args, "--bandwidth", "-b")
			args = append(args, "--max-clients", fmt.Sprintf("%d", s.cfg.MinConnections))
			args = append(args, "--bandwidth", fmt.Sprintf("%.0f", s.cfg.MinBandwidthMbps))
		} else {
			log.Println("[INFO] Starting Conduit in NORMAL mode")
		}

		// Start child
		s.mu.Lock()
		s.child = exec.Command("conduit", args...)
		s.child.Stdout = os.Stdout
		s.child.Stderr = os.Stderr
		if err := s.child.Start(); err != nil {
			s.mu.Unlock()
			return fmt.Errorf("failed to start conduit: %w", err)
		}
		s.mu.Unlock()

		// Single goroutine calls Wait() - this is the ONLY place Wait() is called
		waitErr := make(chan error, 1)
		go func() {
			waitErr <- s.child.Wait()
		}()

		// Wait for child exit, restart signal, or shutdown signal
		select {
		case err := <-waitErr:
			if err != nil {
				log.Printf("[ERROR] Conduit exited with error: %v", err)
				// Backoff before restart
				time.Sleep(5 * time.Second)
			} else {
				log.Println("[INFO] Conduit exited normally")
				return nil // Exit if child exits cleanly
			}
		case <-s.restartChan:
			log.Println("[INFO] Restarting Conduit to apply new settings...")
			s.shutdownChild(waitErr)
			// Loop will continue and restart child
		case <-sigChan:
			log.Println("[INFO] Received signal, shutting down...")
			s.shutdownChild(waitErr)
			return nil
		case <-s.stopChan:
			s.shutdownChild(waitErr)
			return nil
		}
	}
}

// shutdownChild sends SIGTERM to the child process and waits for it to exit
// using the provided wait channel. If the process doesn't exit within 5 seconds,
// it sends SIGKILL. This function does NOT call Wait() - it uses the single
// Wait() goroutine's result channel.
func (s *Supervisor) shutdownChild(waitErr <-chan error) {
	s.mu.Lock()
	child := s.child
	s.mu.Unlock()

	if child == nil || child.Process == nil {
		// Drain the wait channel if child never started properly
		select {
		case <-waitErr:
		default:
		}
		return
	}

	// Try graceful shutdown first
	child.Process.Signal(syscall.SIGTERM)

	// Wait for the single Wait() goroutine to return, with timeout
	select {
	case <-waitErr:
		// Process exited gracefully
		log.Println("[INFO] Child process stopped gracefully")
	case <-time.After(5 * time.Second):
		// Timeout - force kill
		log.Println("[WARN] Child process did not exit gracefully, killing...")
		child.Process.Kill()
		<-waitErr // Wait for the kill to complete
	}
}

func (s *Supervisor) monitorLoop(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	// Initial check
	s.checkTraffic()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.checkTraffic()
		}
	}
}

func (s *Supervisor) checkTraffic() {
	// 1. Check period expiration
	now := time.Now()
	periodDuration := time.Duration(s.cfg.TrafficPeriodDays) * 24 * time.Hour

	s.mu.Lock()
	periodEnd := s.state.PeriodStartTime.Add(periodDuration)
	s.mu.Unlock()

	if now.After(periodEnd) {
		log.Println("[RESET] Traffic period ended. Resetting stats.")

		s.mu.Lock()
		s.state.PeriodStartTime = now
		s.state.BytesUsed = 0
		wasThrottled := s.state.IsThrottled
		s.state.IsThrottled = false
		s.lastScrapeTotal = 0 // Reset scrape counter
		s.mu.Unlock()

		if err := s.saveState(); err != nil {
			log.Printf("[WARN] Failed to save state after reset: %v", err)
		}

		if wasThrottled {
			// Trigger restart to restore normal capacity
			s.triggerRestart()
		}
		return
	}

	// 2. Scrape metrics
	bytesUsed, err := s.scrapeBytesUsed()
	if err != nil {
		// Just log warning, don't crash. Conduit might be starting up.
		// log.Printf("[WARN] Failed to scrape metrics: %v", err)
		return
	}

	s.updateUsage(bytesUsed)
}

func (s *Supervisor) updateUsage(currentSessionTotal int64) {
	var needsRestart bool

	// All state access in a single locked block - no unlock/relock pattern
	s.mu.Lock()
	delta := currentSessionTotal - s.lastScrapeTotal
	if delta < 0 {
		// Process restarted, so currentSessionTotal is the delta from 0
		delta = currentSessionTotal
	}
	s.lastScrapeTotal = currentSessionTotal

	if delta > 0 {
		s.state.BytesUsed += delta
		if err := s.saveState(); err != nil {
			log.Printf("[WARN] Failed to save state: %v", err)
		}
	}

	// Check limits
	limitBytes := int64(s.cfg.TrafficLimitGB * 1024 * 1024 * 1024)
	thresholdBytes := int64(float64(limitBytes) * float64(s.cfg.BandwidthThresholdPercent) / 100.0)

	if !s.state.IsThrottled && s.state.BytesUsed >= thresholdBytes {
		log.Printf("[THROTTLE] Threshold reached (%d%%). Throttling...", s.cfg.BandwidthThresholdPercent)
		s.state.IsThrottled = true
		if err := s.saveState(); err != nil {
			log.Printf("[WARN] Failed to save state: %v", err)
		}
		needsRestart = true
	}
	s.mu.Unlock()

	// Trigger restart outside the lock to avoid deadlock
	if needsRestart {
		s.triggerRestart()
	}
}

func (s *Supervisor) triggerRestart() {
	select {
	case s.restartChan <- struct{}{}:
	default:
		// Restart already pending
	}
}

func (s *Supervisor) scrapeBytesUsed() (int64, error) {
	// Use client with timeout to prevent hanging
	resp, err := httpClient.Get(s.metricsURL)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	// Check HTTP status code
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("metrics returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}

	// Parse Prometheus text format
	lines := strings.Split(string(body), "\n")
	var up, down int64

	for _, line := range lines {
		if strings.HasPrefix(line, "#") {
			continue
		}
		// Use HasPrefix with space for exact metric name matching
		// This prevents matching "conduit_bytes_uploaded_total" etc.
		if strings.HasPrefix(line, "conduit_bytes_uploaded ") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				var val float64
				fmt.Sscanf(parts[1], "%f", &val)
				up = int64(val)
			}
		}
		if strings.HasPrefix(line, "conduit_bytes_downloaded ") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				var val float64
				fmt.Sscanf(parts[1], "%f", &val)
				down = int64(val)
			}
		}
	}

	return up + down, nil
}

func (s *Supervisor) loadState() error {
	data, err := os.ReadFile(s.stateFile)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, &s.state)
}

func (s *Supervisor) saveState() error {
	data, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.stateFile, data, 0644)
}

// filterArgs removes flag and its value from args list
func filterArgs(args []string, longFlag, shortFlag string) []string {
	var filtered []string
	skipNext := false

	for i, arg := range args {
		if skipNext {
			skipNext = false
			continue
		}

		if arg == longFlag || arg == shortFlag {
			// Flag found, skip it
			// If next arg looks like a value (including negative numbers), skip it too
			if i+1 < len(args) && looksLikeValue(args[i+1]) {
				skipNext = true
			}
			continue
		}

		if strings.HasPrefix(arg, longFlag+"=") || strings.HasPrefix(arg, shortFlag+"=") {
			continue
		}

		filtered = append(filtered, arg)
	}
	return filtered
}

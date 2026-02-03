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

// Package config provides configuration loading and validation
package config

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/Psiphon-Inc/conduit/cli/internal/crypto"
	"github.com/Psiphon-Inc/conduit/cli/internal/logging"
)

// Default values for CLI usage
const (
	DefaultMaxClients    = 50
	DefaultBandwidthMbps = 40.0
	MaxClientsLimit      = 1000
	UnlimitedBandwidth   = -1.0 // Special value for no bandwidth limit

	// Traffic throttling minimums (to prevent reputation damage)
	MinTrafficLimitGB       = 100 // Minimum 100 GB
	MinTrafficPeriodDays    = 7   // Minimum 7 days
	MinThresholdPercent     = 60  // Minimum 60%
	MaxThresholdPercent     = 90  // Maximum 90%
	DefaultThresholdPercent = 80  // Default 80%

	// Default throttled values
	DefaultMinConnections   = 10   // Default throttled max clients
	DefaultMinBandwidthMbps = 10.0 // Default throttled bandwidth

	// File names for persisted data
	keyFileName = "conduit_key.json"
)

// Options represents CLI options passed to LoadOrCreate
type Options struct {
	DataDir                   string
	PsiphonConfigPath         string
	UseEmbeddedConfig         bool
	MaxClients                int
	BandwidthMbps             float64
	BandwidthSet              bool
	Verbosity                 int     // 0=normal, 1+=verbose
	StatsFile                 string  // Path to write stats JSON file (empty = disabled)
	MetricsAddr               string  // Address for Prometheus metrics endpoint (empty = disabled)
	TrafficLimitGB            float64 // Total traffic limit in GB (0 = unlimited)
	TrafficPeriodDays         int     // Time period in days for traffic limit
	BandwidthThresholdPercent int     // Percentage at which to throttle (60-90%)
	MinConnections            int     // Max clients when throttled
	MinBandwidthMbps          float64 // Bandwidth in Mbps when throttled
}

// Config represents the validated configuration for the Conduit service
type Config struct {
	KeyPair                    *crypto.KeyPair
	PrivateKeyBase64           string
	MaxClients                 int
	BandwidthBytesPerSecond    int
	DataDir                    string
	PsiphonConfigPath          string
	PsiphonConfigData          []byte        // Embedded config data (if used)
	Verbosity                  int           // 0=normal, 1+=verbose
	StatsFile                  string        // Path to write stats JSON file (empty = disabled)
	MetricsAddr                string        // Address for Prometheus metrics endpoint (empty = disabled)
	TrafficLimitBytes          int64         // Total traffic limit in bytes (0 = unlimited)
	TrafficPeriod              time.Duration // Time period for traffic limit
	BandwidthThresholdBytes    int64         // Bytes at which to throttle
	MinConnections             int           // Max clients when throttled
	MinBandwidthBytesPerSec    int           // Bandwidth in bytes/sec when throttled
	NormalMaxClients           int           // Original max clients (to restore after period)
	NormalBandwidthBytesPerSec int           // Original bandwidth (to restore after period)
}

// persistedKey represents the key data saved to disk
type persistedKey struct {
	Mnemonic         string `json:"mnemonic"`
	PrivateKeyBase64 string `json:"privateKeyBase64"`
}

// LoadOrCreate loads existing configuration or creates a new one with generated keys.
func LoadOrCreate(opts Options) (*Config, error) {
	// Ensure data directory exists
	if opts.DataDir == "" {
		opts.DataDir = "./data"
	}
	if err := os.MkdirAll(opts.DataDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	// Try to load existing key, or generate new one
	keyPair, privateKeyBase64, err := loadOrCreateKey(opts.DataDir, opts.Verbosity > 0)
	if err != nil {
		return nil, fmt.Errorf("failed to load or create key: %w", err)
	}

	// Handle psiphon config source
	var psiphonConfigData []byte
	var psiphonConfigFileData []byte
	if opts.UseEmbeddedConfig {
		psiphonConfigData = GetEmbeddedPsiphonConfig()
		psiphonConfigFileData = psiphonConfigData
	} else if opts.PsiphonConfigPath != "" {
		data, err := os.ReadFile(opts.PsiphonConfigPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read psiphon config file: %w", err)
		}
		psiphonConfigFileData = data
	}

	// Parse inproxy settings from config if available
	var inproxyConfig struct {
		InproxyMaxClients                    *int `json:"InproxyMaxClients"`
		InproxyLimitUpstreamBytesPerSecond   *int `json:"InproxyLimitUpstreamBytesPerSecond"`
		InproxyLimitDownstreamBytesPerSecond *int `json:"InproxyLimitDownstreamBytesPerSecond"`
	}
	if len(psiphonConfigFileData) > 0 {
		if err := json.Unmarshal(psiphonConfigFileData, &inproxyConfig); err != nil {
			return nil, fmt.Errorf("failed to parse psiphon config file: %w", err)
		}
	}

	// Resolve max clients: flag > config > default
	maxClients := opts.MaxClients
	if maxClients == 0 && inproxyConfig.InproxyMaxClients != nil {
		maxClients = *inproxyConfig.InproxyMaxClients
	}
	if maxClients == 0 {
		maxClients = DefaultMaxClients
	}
	if maxClients < 1 || maxClients > MaxClientsLimit {
		return nil, fmt.Errorf("max-clients must be between 1 and %d", MaxClientsLimit)
	}

	// Resolve bandwidth: flag > config > default
	var bandwidthBytesPerSecond int
	if opts.BandwidthSet {
		bandwidthMbps := opts.BandwidthMbps
		if bandwidthMbps != UnlimitedBandwidth && bandwidthMbps < 1 {
			return nil, fmt.Errorf("bandwidth must be at least 1 Mbps (or -1 for unlimited)")
		}
		if bandwidthMbps == UnlimitedBandwidth {
			bandwidthBytesPerSecond = 0
		} else {
			bandwidthBytesPerSecond = int(bandwidthMbps * 1000 * 1000 / 8)
		}
	} else {
		hasUpstream := inproxyConfig.InproxyLimitUpstreamBytesPerSecond != nil
		hasDownstream := inproxyConfig.InproxyLimitDownstreamBytesPerSecond != nil
		if hasUpstream && *inproxyConfig.InproxyLimitUpstreamBytesPerSecond < 0 {
			return nil, fmt.Errorf("bandwidth must be at least 1 Mbps (or -1 for unlimited)")
		}
		if hasDownstream && *inproxyConfig.InproxyLimitDownstreamBytesPerSecond < 0 {
			return nil, fmt.Errorf("bandwidth must be at least 1 Mbps (or -1 for unlimited)")
		}
		minPositive := 0
		if hasUpstream && *inproxyConfig.InproxyLimitUpstreamBytesPerSecond > 0 {
			minPositive = *inproxyConfig.InproxyLimitUpstreamBytesPerSecond
		}
		if hasDownstream && *inproxyConfig.InproxyLimitDownstreamBytesPerSecond > 0 {
			if minPositive == 0 || *inproxyConfig.InproxyLimitDownstreamBytesPerSecond < minPositive {
				minPositive = *inproxyConfig.InproxyLimitDownstreamBytesPerSecond
			}
		}
		if minPositive > 0 {
			bandwidthBytesPerSecond = minPositive
		} else if hasUpstream || hasDownstream {
			bandwidthBytesPerSecond = 0
		} else {
			bandwidthBytesPerSecond = int(DefaultBandwidthMbps * 1000 * 1000 / 8)
		}
	}

	// Validate and convert traffic throttling parameters
	var trafficLimitBytes int64
	var trafficPeriod time.Duration
	var bandwidthThresholdBytes int64
	var minConnections int
	var minBandwidthBytesPerSec int
	var normalMaxClients int
	var normalBandwidthBytesPerSec int

	if opts.TrafficLimitGB > 0 {
		// Require all throttling parameters together
		if opts.TrafficPeriodDays <= 0 {
			return nil, fmt.Errorf("traffic-period must be set when traffic-limit is specified")
		}
		if opts.BandwidthThresholdPercent <= 0 {
			return nil, fmt.Errorf("bandwidth-threshold must be set when traffic-limit is specified")
		}

		// Validate minimums
		if opts.TrafficLimitGB < MinTrafficLimitGB {
			return nil, fmt.Errorf("traffic-limit must be at least %d GB", MinTrafficLimitGB)
		}

		if opts.TrafficPeriodDays < MinTrafficPeriodDays {
			return nil, fmt.Errorf("traffic-period must be at least %d days", MinTrafficPeriodDays)
		}

		// Validate threshold range
		if opts.BandwidthThresholdPercent < MinThresholdPercent || opts.BandwidthThresholdPercent > MaxThresholdPercent {
			return nil, fmt.Errorf("bandwidth-threshold must be between %d-%d%%", MinThresholdPercent, MaxThresholdPercent)
		}

		// Validate min settings
		if opts.MinConnections <= 0 {
			return nil, fmt.Errorf("min-connections must be positive")
		}

		if opts.MinConnections >= maxClients {
			return nil, fmt.Errorf("min-connections (%d) must be less than max-clients (%d)", opts.MinConnections, maxClients)
		}

		if opts.MinBandwidthMbps <= 0 {
			return nil, fmt.Errorf("min-bandwidth must be positive")
		}

		// Calculate actual bandwidth for comparison
		actualBandwidthMbps := float64(bandwidthBytesPerSecond) * 8 / (1000 * 1000)
		if bandwidthBytesPerSecond > 0 && opts.MinBandwidthMbps >= actualBandwidthMbps {
			return nil, fmt.Errorf("min-bandwidth (%.1f) must be less than normal bandwidth (%.1f)", opts.MinBandwidthMbps, actualBandwidthMbps)
		}

		// Convert GB to bytes (1 GB = 1024^3 bytes)
		trafficLimitBytes = int64(opts.TrafficLimitGB * 1024 * 1024 * 1024)
		trafficPeriod = time.Duration(opts.TrafficPeriodDays) * 24 * time.Hour

		// Calculate threshold bytes
		bandwidthThresholdBytes = int64(float64(trafficLimitBytes) * float64(opts.BandwidthThresholdPercent) / 100.0)

		// Set throttled values
		minConnections = opts.MinConnections
		minBandwidthBytesPerSec = int(opts.MinBandwidthMbps * 1000 * 1000 / 8)

		// Store normal values for restoration
		normalMaxClients = maxClients
		normalBandwidthBytesPerSec = bandwidthBytesPerSecond
	}

	return &Config{
		KeyPair:                    keyPair,
		PrivateKeyBase64:           privateKeyBase64,
		MaxClients:                 maxClients,
		BandwidthBytesPerSecond:    bandwidthBytesPerSecond,
		DataDir:                    opts.DataDir,
		PsiphonConfigPath:          opts.PsiphonConfigPath,
		PsiphonConfigData:          psiphonConfigData,
		Verbosity:                  opts.Verbosity,
		StatsFile:                  opts.StatsFile,
		MetricsAddr:                opts.MetricsAddr,
		TrafficLimitBytes:          trafficLimitBytes,
		TrafficPeriod:              trafficPeriod,
		BandwidthThresholdBytes:    bandwidthThresholdBytes,
		MinConnections:             minConnections,
		MinBandwidthBytesPerSec:    minBandwidthBytesPerSec,
		NormalMaxClients:           normalMaxClients,
		NormalBandwidthBytesPerSec: normalBandwidthBytesPerSec,
	}, nil
}

// loadOrCreateKey loads an existing key from disk or generates a new one
func loadOrCreateKey(dataDir string, verbose bool) (*crypto.KeyPair, string, error) {
	keyPath := filepath.Join(dataDir, keyFileName)

	// Try to load existing key
	if data, err := os.ReadFile(keyPath); err == nil {
		var pk persistedKey
		if err := json.Unmarshal(data, &pk); err == nil && pk.PrivateKeyBase64 != "" {
			// Parse the stored key
			privateKeyBytes, err := base64.RawStdEncoding.DecodeString(pk.PrivateKeyBase64)
			if err != nil {
				privateKeyBytes, err = base64.StdEncoding.DecodeString(pk.PrivateKeyBase64)
			}
			if err == nil {
				keyPair, err := crypto.ParsePrivateKey(privateKeyBytes)
				if err == nil {
					if verbose {
						logging.Println("Loaded existing key from", keyPath)
					}
					return keyPair, pk.PrivateKeyBase64, nil
				}
			}
		}
	}

	// Generate new key

	// Generate mnemonic for backup purposes
	mnemonic, err := crypto.GenerateMnemonic()
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate mnemonic: %w", err)
	}

	// Derive key from mnemonic
	keyPair, err := crypto.DeriveKeyPairFromMnemonic(mnemonic, "")
	if err != nil {
		return nil, "", fmt.Errorf("failed to derive key: %w", err)
	}

	privateKeyBase64 := base64.RawStdEncoding.EncodeToString(keyPair.PrivateKey)

	// Save to disk
	pk := persistedKey{
		Mnemonic:         mnemonic,
		PrivateKeyBase64: privateKeyBase64,
	}
	data, err := json.MarshalIndent(pk, "", "  ")
	if err != nil {
		return nil, "", fmt.Errorf("failed to marshal key: %w", err)
	}

	if err := os.WriteFile(keyPath, data, 0600); err != nil {
		return nil, "", fmt.Errorf("failed to save key: %w", err)
	}

	if verbose {
		logging.Printf("New keys saved to %s\n", keyPath)
	}

	return keyPair, privateKeyBase64, nil
}

// loadOrCreateKey loads an existing key from disk or generates a new one
func LoadKey(dataDir string) (*crypto.KeyPair, string, error) {
	keyPath := filepath.Join(dataDir, keyFileName)

	// Try to load existing key
	data, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, "", fmt.Errorf("failed to load key: %w", err)
	}

	var pk persistedKey
	if err := json.Unmarshal(data, &pk); err != nil || pk.PrivateKeyBase64 == "" {
		return nil, "", fmt.Errorf("failed to parse key: %w", err)
	}

	// Parse the stored key
	privateKeyBytes, err := base64.RawStdEncoding.DecodeString(pk.PrivateKeyBase64)
	if err != nil {
		privateKeyBytes, err = base64.StdEncoding.DecodeString(pk.PrivateKeyBase64)
	}

	if err != nil {
		return nil, pk.PrivateKeyBase64, fmt.Errorf("failed to parse key: %w", err)
	}

	keyPair, err := crypto.ParsePrivateKey(privateKeyBytes)
	return keyPair, pk.PrivateKeyBase64, err

}

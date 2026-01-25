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

	"github.com/Psiphon-Inc/conduit/cli/internal/crypto"
)

// Default values for CLI usage
const (
	DefaultMaxClients    = 50
	DefaultBandwidthMbps = 40.0
	MaxClientsLimit      = 1000
	UnlimitedBandwidth   = -1.0 // Special value for no bandwidth limit

	// File names for persisted data
	keyFileName = "conduit_key.json"
)

// Options represents CLI options passed to LoadOrCreate
type Options struct {
	DataDir           string
	PsiphonConfigPath string
	UseEmbeddedConfig bool
	MaxClients        int
	BandwidthMbps     float64
	Verbosity         int    // 0=normal, 1=verbose, 2+=debug
	StatsFile         string // Path to write stats JSON file (empty = disabled)
}

// Config represents the validated configuration for the Conduit service
type Config struct {
	KeyPair                 *crypto.KeyPair
	PrivateKeyBase64        string
	MaxClients              int
	BandwidthBytesPerSecond int
	DataDir                 string
	PsiphonConfigPath       string
	PsiphonConfigData       []byte // Embedded config data (if used)
	Verbosity               int    // 0=normal, 1=verbose, 2+=debug
	StatsFile               string // Path to write stats JSON file (empty = disabled)
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

	// Validate limits
	maxClients := opts.MaxClients
	if maxClients == 0 {
		maxClients = DefaultMaxClients
	}
	if maxClients < 1 || maxClients > MaxClientsLimit {
		return nil, fmt.Errorf("max-clients must be between 1 and %d", MaxClientsLimit)
	}

	bandwidthMbps := opts.BandwidthMbps
	if bandwidthMbps == 0 {
		bandwidthMbps = DefaultBandwidthMbps
	}
	if bandwidthMbps != UnlimitedBandwidth && bandwidthMbps < 1 {
		return nil, fmt.Errorf("bandwidth must be at least 1 Mbps (or -1 for unlimited)")
	}

	// Convert Mbps to bytes per second (0 means unlimited)
	var bandwidthBytesPerSecond int
	if bandwidthMbps == UnlimitedBandwidth {
		bandwidthBytesPerSecond = 0 // 0 signals unlimited
	} else {
		bandwidthBytesPerSecond = int(bandwidthMbps * 1000 * 1000 / 8)
	}

	// Handle psiphon config source
	var psiphonConfigData []byte
	if opts.UseEmbeddedConfig {
		psiphonConfigData = GetEmbeddedPsiphonConfig()
	}

	return &Config{
		KeyPair:                 keyPair,
		PrivateKeyBase64:        privateKeyBase64,
		MaxClients:              maxClients,
		BandwidthBytesPerSecond: bandwidthBytesPerSecond,
		DataDir:                 opts.DataDir,
		PsiphonConfigPath:       opts.PsiphonConfigPath,
		PsiphonConfigData:       psiphonConfigData,
		Verbosity:               opts.Verbosity,
		StatsFile:               opts.StatsFile,
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
						fmt.Println("Loaded existing key from", keyPath)
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
		fmt.Printf("New keys saved to %s\n", keyPath)
	}

	return keyPair, privateKeyBase64, nil
}

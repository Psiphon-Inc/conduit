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

package geo

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const (
	// MaxMind GeoLite2 Free Database (no account required)
	// This is a direct download link for the GeoLite2-Country database
	geoLite2URL = "https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-Country.mmdb"

	maxDownloadSize = 10 * 1024 * 1024 // 10MB max
	downloadTimeout = 30 * time.Second
)

// EnsureDatabase checks if the GeoIP database exists, downloads if missing
func EnsureDatabase(dbPath string) error {
	// Check if database already exists
	if _, err := os.Stat(dbPath); err == nil {
		return nil
	}

	// Database doesn't exist, download it
	fmt.Printf("[GEO] Downloading GeoLite2 database...\n")
	return downloadDatabase(dbPath)
}

// UpdateDatabase checks if database needs updating and downloads new version
func UpdateDatabase(dbPath string) error {
	// Check file modification time
	info, err := os.Stat(dbPath)
	if err != nil {
		// Database doesn't exist, download it
		return downloadDatabase(dbPath)
	}

	// Only update if older than 7 days
	if time.Since(info.ModTime()) < 7*24*time.Hour {
		return nil
	}

	fmt.Printf("[GEO] Updating GeoLite2 database...\n")

	// Download to temporary file first
	tmpPath := dbPath + ".tmp"
	if err := downloadDatabase(tmpPath); err != nil {
		return err
	}

	// Replace old database with new one
	if err := os.Rename(tmpPath, dbPath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("failed to replace database: %w", err)
	}

	return nil
}

// downloadDatabase downloads the GeoLite2 database
func downloadDatabase(destPath string) error {
	// Ensure directory exists
	dir := filepath.Dir(destPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: downloadTimeout,
	}

	// Download the database
	resp, err := client.Get(geoLite2URL)
	if err != nil {
		return fmt.Errorf("failed to download database: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status: %d", resp.StatusCode)
	}

	// Create destination file
	out, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer out.Close()

	// Copy with size limit
	written, err := io.Copy(out, io.LimitReader(resp.Body, maxDownloadSize))
	if err != nil {
		os.Remove(destPath)
		return fmt.Errorf("failed to write database: %w", err)
	}

	fmt.Printf("[GEO] Downloaded %d bytes\n", written)
	return nil
}

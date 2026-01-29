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

// Package geo provides client geolocation using MaxMind GeoLite2 database
package geo

import (
	"context"
	"fmt"
	"net"
	"sort"
	"sync"
	"time"

	"github.com/oschwald/geoip2-golang"
)

// Result represents a country with connection stats
type Result struct {
	Code       string `json:"code"`
	Country    string `json:"country"`
	Count      int    `json:"count"`       // Currently connected clients
	CountTotal int    `json:"count_total"` // Total unique clients since start
	BytesUp    int64  `json:"bytes_up"`    // Total bytes since start
	BytesDown  int64  `json:"bytes_down"`  // Total bytes since start
}

// countryData stores stats per country
type countryData struct {
	name      string
	live      int                 // currently open connections
	totalIPs  map[string]struct{} // all unique IPs ever seen
	bytesUp   int64
	bytesDown int64
}

// Collector collects geo stats
type Collector struct {
	mu        sync.RWMutex
	countries map[string]*countryData // country code -> data
	relayLive int                     // currently open relay connections
	relayAll  map[string]struct{}     // all unique relay IPs ever seen
	relayUp   int64
	relayDown int64
	db        *geoip2.Reader
	dbPath    string
}

// NewCollector creates a new geo stats collector
func NewCollector(dbPath string) *Collector {
	return &Collector{
		dbPath:    dbPath,
		countries: make(map[string]*countryData),
		relayAll:  make(map[string]struct{}),
	}
}

// Start begins collecting geo stats in the background
func (c *Collector) Start(ctx context.Context) error {
	if err := EnsureDatabase(c.dbPath); err != nil {
		return fmt.Errorf("failed to ensure database: %w", err)
	}

	db, err := geoip2.Open(c.dbPath)
	if err != nil {
		return fmt.Errorf("failed to open GeoIP database: %w", err)
	}
	c.db = db

	go c.autoUpdate(ctx)

	return nil
}

// Stop closes the database
func (c *Collector) Stop() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.db != nil {
		return c.db.Close()
	}
	return nil
}

// ConnectIP records a new connection from an IP (call when connection opens)
func (c *Collector) ConnectIP(ipStr string) {
	ip := net.ParseIP(ipStr)
	if ip == nil || isPrivateIP(ip) {
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.db == nil {
		return
	}

	record, err := c.db.Country(ip)
	if err != nil || record.Country.IsoCode == "" {
		return
	}

	code := record.Country.IsoCode
	cd, exists := c.countries[code]
	if !exists {
		name := code
		if countryName, ok := record.Country.Names["en"]; ok && countryName != "" {
			name = countryName
		}
		cd = &countryData{
			name:     name,
			totalIPs: make(map[string]struct{}),
		}
		c.countries[code] = cd
	}

	cd.live++
	cd.totalIPs[ipStr] = struct{}{}
}

// DisconnectIP records bandwidth and closes connection (call when connection closes)
func (c *Collector) DisconnectIP(ipStr string, bytesUp, bytesDown int64) {
	ip := net.ParseIP(ipStr)
	if ip == nil || isPrivateIP(ip) {
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.db == nil {
		return
	}

	record, err := c.db.Country(ip)
	if err != nil || record.Country.IsoCode == "" {
		return
	}

	code := record.Country.IsoCode
	cd, exists := c.countries[code]
	if !exists {
		// Shouldn't happen, but handle gracefully
		name := code
		if countryName, ok := record.Country.Names["en"]; ok && countryName != "" {
			name = countryName
		}
		cd = &countryData{
			name:     name,
			totalIPs: make(map[string]struct{}),
		}
		c.countries[code] = cd
	}

	if cd.live > 0 {
		cd.live--
	}
	cd.totalIPs[ipStr] = struct{}{}
	cd.bytesUp += bytesUp
	cd.bytesDown += bytesDown
}

// ConnectRelay records a new relay connection (call when connection opens)
func (c *Collector) ConnectRelay(ipStr string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.relayLive++
	c.relayAll[ipStr] = struct{}{}
}

// DisconnectRelay records bandwidth and closes relay connection (call when connection closes)
func (c *Collector) DisconnectRelay(ipStr string, bytesUp, bytesDown int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.relayLive > 0 {
		c.relayLive--
	}
	c.relayAll[ipStr] = struct{}{}
	c.relayUp += bytesUp
	c.relayDown += bytesDown
}

// autoUpdate checks for database updates once per day
func (c *Collector) autoUpdate(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := UpdateDatabase(c.dbPath); err != nil {
				continue
			}
			c.mu.Lock()
			if c.db != nil {
				c.db.Close()
			}
			db, err := geoip2.Open(c.dbPath)
			if err == nil {
				c.db = db
			}
			c.mu.Unlock()
		}
	}
}

// GetResults returns the current geo stats (includes relay as special entry)
func (c *Collector) GetResults() []Result {
	c.mu.RLock()
	defer c.mu.RUnlock()

	results := make([]Result, 0, len(c.countries)+1)
	for code, cd := range c.countries {
		results = append(results, Result{
			Code:       code,
			Country:    cd.name,
			Count:      cd.live,
			CountTotal: len(cd.totalIPs),
			BytesUp:    cd.bytesUp,
			BytesDown:  cd.bytesDown,
		})
	}

	// Add relay stats as special entry if any relay connections occurred
	if len(c.relayAll) > 0 || c.relayLive > 0 {
		results = append(results, Result{
			Code:       "RELAY",
			Country:    "Unknown (TURN Relay)",
			Count:      c.relayLive,
			CountTotal: len(c.relayAll),
			BytesUp:    c.relayUp,
			BytesDown:  c.relayDown,
		})
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Count > results[j].Count
	})

	return results
}

// isPrivateIP checks if an IP is private/internal
func isPrivateIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast()
}

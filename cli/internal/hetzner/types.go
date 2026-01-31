/*
 * Copyright (c) 2026, Psiphon Inc.
 * All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

package hetzner

import "time"

// ProgressPhase is the current phase of setup for a server.
type ProgressPhase string

const (
	ProgressCreating ProgressPhase = "creating"
	ProgressWaiting  ProgressPhase = "waiting"
	ProgressReady    ProgressPhase = "ready"
)

// ProgressReport is passed to the optional Progress callback during setup.
type ProgressReport struct {
	ServerNum int           // 1-based index (e.g. 1 of 3)
	Total     int           // total servers
	Name      string        // server name (e.g. conduit-1)
	IPv4      string        // server IP
	Phase     ProgressPhase // current phase
	Elapsed   time.Duration // time spent in waiting phase (0 for creating/ready)
	Timeout   time.Duration // max wait time for Conduit (0 for creating/ready)
	Err       error         // non-nil if this server failed
}

// SetupOpts holds options for provisioning Conduit servers on Hetzner Cloud.
type SetupOpts struct {
	APIToken      string  // Hetzner Cloud API token (must be from the project where servers are created)
	ServerCount   int     // Number of servers to create
	ServerType    string  // Server type name (e.g. cx11, cpx11)
	Location      string  // Location name (e.g. fsn1, nbg1)
	MaxClients    int     // Conduit max-clients per server
	BandwidthMbps float64 // Conduit bandwidth limit in Mbps (-1 = unlimited)
	SSHPublicKey  string  // Optional SSH public key for server access
	// Progress is called during setup for each server (creating → waiting → ready). Optional.
	Progress func(ProgressReport)
}

// ServerInfo describes a created server for display.
type ServerInfo struct {
	Name   string
	ID     int
	IPv4   string
	Status string
}

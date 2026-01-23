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

// Package service provides cross-platform system service management for Conduit.
package service

// Manager defines the interface for platform-specific service managers.
type Manager interface {
	// Install installs Conduit as a system service
	Install(opts InstallOptions) error

	// Uninstall removes the Conduit system service
	Uninstall() error

	// Start starts the service
	Start() error

	// Stop stops the service
	Stop() error

	// Status returns the current service status
	Status() (string, error)

	// StatusFollow watches live service statistics
	StatusFollow() error

	// Logs streams the service logs to stdout
	Logs() error
}

// InstallOptions contains configuration for service installation.
type InstallOptions struct {
	MaxClients        int
	BandwidthMbps     float64
	PsiphonConfigPath string
	Verbose           bool
}

const (
	ServiceName        = "conduit"
	ServiceDisplayName = "Psiphon Conduit"
	ServiceDescription = "Psiphon Conduit inproxy service - relays traffic for users in censored regions"
)

// NewManager returns the appropriate service manager for the current platform.
// This function is implemented in platform-specific files.

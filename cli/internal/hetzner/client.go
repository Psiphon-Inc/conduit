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

package hetzner

import (
	"context"
	"fmt"
	"strings"

	"github.com/hetznercloud/hcloud-go/hcloud"
)

// ConduitServerPrefix is the name prefix for servers created by conduit hetzner setup.
const ConduitServerPrefix = "conduit"

// Client wraps the Hetzner Cloud API client.
type Client struct {
	*hcloud.Client
}

// NewClient creates a Hetzner Cloud client with the given API token.
func NewClient(token string) *Client {
	return &Client{
		Client: hcloud.NewClient(hcloud.WithToken(token), hcloud.WithApplication("conduit-hetzner-setup", "1.0")),
	}
}

// ListServerTypes returns available server types (names and descriptions).
func (c *Client) ListServerTypes(ctx context.Context) ([]*hcloud.ServerType, error) {
	types, err := c.ServerType.All(ctx)
	if err != nil {
		return nil, fmt.Errorf("list server types: %w", err)
	}
	return types, nil
}

// ListLocations returns available locations.
func (c *Client) ListLocations(ctx context.Context) ([]*hcloud.Location, error) {
	locs, err := c.Location.All(ctx)
	if err != nil {
		return nil, fmt.Errorf("list locations: %w", err)
	}
	return locs, nil
}

// ServerCount returns the number of servers in the project (used to show "you have N servers" and inform max).
func (c *Client) ServerCount(ctx context.Context) (int, error) {
	servers, err := c.Server.All(ctx)
	if err != nil {
		return 0, fmt.Errorf("list servers: %w", err)
	}
	return len(servers), nil
}

// ListConduitServers returns servers whose name starts with ConduitServerPrefix ("conduit"), with Name, ID, IPv4.
func (c *Client) ListConduitServers(ctx context.Context) ([]ServerInfo, error) {
	servers, err := c.Server.All(ctx)
	if err != nil {
		return nil, fmt.Errorf("list servers: %w", err)
	}
	var out []ServerInfo
	for _, s := range servers {
		if !strings.HasPrefix(s.Name, ConduitServerPrefix) {
			continue
		}
		ipv4 := ""
		if s.PublicNet.IPv4.IP != nil {
			ipv4 = s.PublicNet.IPv4.IP.String()
		}
		out = append(out, ServerInfo{
			Name:   s.Name,
			ID:     s.ID,
			IPv4:   ipv4,
			Status: fmt.Sprint(s.Status),
		})
	}
	return out, nil
}

// EnsureSSHKey ensures an SSH key named "conduit-setup" exists in the project;
// if publicKey is non-empty and no key exists, it creates one. Returns the key to use.
func (c *Client) EnsureSSHKey(ctx context.Context, name, publicKey string) (*hcloud.SSHKey, error) {
	key, _, err := c.SSHKey.GetByName(ctx, name)
	if err != nil {
		return nil, fmt.Errorf("get ssh key: %w", err)
	}
	if key != nil {
		return key, nil
	}
	if publicKey == "" {
		return nil, fmt.Errorf("no SSH key named %q in project and no public key provided; add an SSH key in Hetzner Console or pass one", name)
	}
	key, _, err = c.SSHKey.Create(ctx, hcloud.SSHKeyCreateOpts{
		Name:      name,
		PublicKey: publicKey,
	})
	if err != nil {
		return nil, fmt.Errorf("create ssh key: %w", err)
	}
	return key, nil
}

// DefaultImage is the Ubuntu image used for Conduit servers.
const DefaultImage = "ubuntu-24.04"

// MaxServersPerProject is the maximum number of servers to allow in one setup run.
// Hetzner does not expose per-project server limit via API; this is a sensible upper bound.
const MaxServersPerProject = 100

// DeleteServer deletes a server by ID. Used for cleanup on partial failure.
func (c *Client) DeleteServer(ctx context.Context, serverID int) error {
	_, err := c.Server.Delete(ctx, &hcloud.Server{ID: serverID})
	if err != nil {
		return fmt.Errorf("delete server %d: %w", serverID, err)
	}
	return nil
}

// ValidateServerTypeLocationArchitecture validates that a server type, location, and architecture combination is valid.
func (c *Client) ValidateServerTypeLocationArchitecture(ctx context.Context, serverTypeName, locationName string, arch hcloud.Architecture) error {
	serverType, _, err := c.ServerType.GetByName(ctx, serverTypeName)
	if err != nil || serverType == nil {
		return fmt.Errorf("get server type %s: %w", serverTypeName, err)
	}

	// Check if location is available for this server type
	location, err := resolveLocationForServerType(serverType, locationName)
	if err != nil {
		return err
	}

	// Check if image is available for this architecture in this location
	image, _, err := c.Image.GetForArchitecture(ctx, DefaultImage, arch)
	if err != nil || image == nil {
		return fmt.Errorf("image %s not available for architecture %s: %w", DefaultImage, arch, err)
	}

	// Verify server type is available in this location (check pricing)
	found := false
	for _, p := range serverType.Pricings {
		if p.Location != nil && p.Location.Name == location.Name {
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("server type %s is not available in location %s", serverTypeName, locationName)
	}

	return nil
}

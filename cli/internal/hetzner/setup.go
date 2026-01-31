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
	"sync"

	"github.com/hetznercloud/hcloud-go/hcloud"
)

// resolveLocationForServerType returns a location where the server type is available.
// If preferred is non-empty, it must match one of the type's locations; otherwise the first is used.
func resolveLocationForServerType(serverType *hcloud.ServerType, preferred string) (*hcloud.Location, error) {
	if len(serverType.Pricings) == 0 {
		return nil, fmt.Errorf("server type %s has no locations (no pricings)", serverType.Name)
	}
	preferred = strings.TrimSpace(strings.ToLower(preferred))
	if preferred == "" {
		loc := serverType.Pricings[0].Location
		if loc == nil {
			return nil, fmt.Errorf("server type %s has invalid pricing (nil location)", serverType.Name)
		}
		return loc, nil
	}
	for _, p := range serverType.Pricings {
		if p.Location != nil && strings.ToLower(p.Location.Name) == preferred {
			return p.Location, nil
		}
	}
	var names []string
	for _, p := range serverType.Pricings {
		if p.Location != nil {
			names = append(names, p.Location.Name)
		}
	}
	return nil, fmt.Errorf("location %q is not available for server type %s; available for this type: %s",
		preferred, serverType.Name, strings.Join(names, ", "))
}

// Setup creates servers in Hetzner Cloud and configures them with Conduit via cloud-init.
// The API token must be from the Hetzner project where you want servers (e.g. create a
// project named "Conduit" in the Hetzner Console and use that project's token).
func (c *Client) Setup(ctx context.Context, opts SetupOpts) ([]ServerInfo, error) {
	userData, err := CloudInitUserData(opts)
	if err != nil {
		return nil, fmt.Errorf("cloud-init: %w", err)
	}

	image, _, err := c.Image.GetForArchitecture(ctx, DefaultImage, hcloud.ArchitectureX86)
	if err != nil || image == nil {
		return nil, fmt.Errorf("get image %s: %w", DefaultImage, err)
	}

	serverType, _, err := c.ServerType.GetByName(ctx, opts.ServerType)
	if err != nil || serverType == nil {
		return nil, fmt.Errorf("get server type %s: %w", opts.ServerType, err)
	}

	// Resolve location: must be one where this server type is available (from Pricings).
	location, err := resolveLocationForServerType(serverType, opts.Location)
	if err != nil {
		return nil, err
	}

	var sshKeys []*hcloud.SSHKey
	if opts.SSHPublicKey != "" {
		key, err := c.EnsureSSHKey(ctx, "conduit-setup", opts.SSHPublicKey)
		if err != nil {
			return nil, err
		}
		sshKeys = []*hcloud.SSHKey{key}
	}

	// Serialize progress callbacks when running in parallel
	var progressMu sync.Mutex
	progress := func(r ProgressReport) {
		if opts.Progress == nil {
			return
		}
		progressMu.Lock()
		opts.Progress(r)
		progressMu.Unlock()
	}

	// Phase 1: create all servers in parallel (all start Create at once via barrier)
	type created struct {
		name   string
		id     int
		ipv4   string
		server int // 1-based index
	}
	createdServers := make([]*created, opts.ServerCount)
	var createWg sync.WaitGroup
	var createBarrier sync.WaitGroup
	createBarrier.Add(opts.ServerCount)
	var firstCreateErr error
	var createMu sync.Mutex
	for i := 0; i < opts.ServerCount; i++ {
		createWg.Add(1)
		go func(i int) {
			defer createWg.Done()
			name := fmt.Sprintf("conduit-%d", i+1)
			progress(ProgressReport{
				ServerNum: i + 1,
				Total:     opts.ServerCount,
				Name:      name,
				Phase:     ProgressCreating,
			})
			createBarrier.Done()
			createBarrier.Wait() // all goroutines reach here before any calls Create
			createOpts := hcloud.ServerCreateOpts{
				Name:       name,
				ServerType: serverType,
				Image:      image,
				Location:   location,
				UserData:   userData,
				Labels:     map[string]string{"app": "conduit", "managed-by": "conduit-hetzner-setup"},
			}
			if len(sshKeys) > 0 {
				createOpts.SSHKeys = sshKeys
			}
			start := true
			createOpts.StartAfterCreate = &start

			result, _, err := c.Server.Create(ctx, createOpts)
			if err != nil {
				createMu.Lock()
				if firstCreateErr == nil {
					firstCreateErr = fmt.Errorf("create server %s: %w", name, err)
				}
				createMu.Unlock()
				return
			}
			if err := c.Action.WaitFor(ctx, result.Action); err != nil {
				createMu.Lock()
				if firstCreateErr == nil {
					firstCreateErr = fmt.Errorf("wait for server %s: %w", name, err)
				}
				createMu.Unlock()
				return
			}
			server, _, err := c.Server.GetByID(ctx, result.Server.ID)
			if err != nil || server == nil {
				createMu.Lock()
				if firstCreateErr == nil {
					firstCreateErr = fmt.Errorf("get server %s: %w", name, err)
				}
				createMu.Unlock()
				return
			}
			ipv4 := ""
			if server.PublicNet.IPv4.IP != nil {
				ipv4 = server.PublicNet.IPv4.IP.String()
			}
			createMu.Lock()
			createdServers[i] = &created{name: name, id: server.ID, ipv4: ipv4, server: i + 1}
			createMu.Unlock()
		}(i)
	}
	createWg.Wait()
	if firstCreateErr != nil {
		return nil, firstCreateErr
	}
	for i := range createdServers {
		if createdServers[i] == nil {
			return nil, fmt.Errorf("server conduit-%d: create result missing", i+1)
		}
	}

	// Phase 2: wait for Conduit on all servers in parallel
	var waitWg sync.WaitGroup
	var firstWaitErr error
	var waitMu sync.Mutex
	for i := 0; i < opts.ServerCount; i++ {
		cre := createdServers[i]
		progress(ProgressReport{
			ServerNum: cre.server,
			Total:     opts.ServerCount,
			Name:      cre.name,
			IPv4:      cre.ipv4,
			Phase:     ProgressWaiting,
			Timeout:   conduitReadyTimeout,
		})
		waitWg.Add(1)
		go func(cre *created) {
			defer waitWg.Done()
			report := ProgressReport{
				ServerNum: cre.server,
				Total:     opts.ServerCount,
				Name:      cre.name,
				IPv4:      cre.ipv4,
				Phase:     ProgressWaiting,
				Timeout:   conduitReadyTimeout,
			}
			err := waitForConduitReady(ctx, cre.ipv4, report, progress)
			if err != nil {
				waitMu.Lock()
				if firstWaitErr == nil {
					firstWaitErr = fmt.Errorf("server %s (%s): Conduit did not become ready within %v: %w", cre.name, cre.ipv4, conduitReadyTimeout, err)
				}
				waitMu.Unlock()
				return
			}
			progress(ProgressReport{
				ServerNum: cre.server,
				Total:     opts.ServerCount,
				Name:      cre.name,
				IPv4:      cre.ipv4,
				Phase:     ProgressReady,
			})
		}(cre)
	}
	waitWg.Wait()
	if firstWaitErr != nil {
		return nil, firstWaitErr
	}

	results := make([]ServerInfo, 0, opts.ServerCount)
	for _, cre := range createdServers {
		results = append(results, ServerInfo{
			Name:   cre.name,
			ID:     cre.id,
			IPv4:   cre.ipv4,
			Status: "ready",
		})
	}
	return results, nil
}

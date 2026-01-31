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
	"bytes"
	"fmt"
	"text/template"
)

// ConduitReleaseRepo is the GitHub repo for CLI releases.
const ConduitReleaseRepo = "Psiphon-Inc/conduit"

// cloud-init: install Conduit from GitHub release binary (no Docker).
// Uses systemd to run the binary with embedded config.
var cloudInitTmpl = `#cloud-config
package_update: true
package_upgrade: true
packages:
  - curl
  - ca-certificates
runcmd:
  - mkdir -p /usr/local/bin /var/lib/conduit
  - |
    TAG=$(curl -sL https://api.github.com/repos/{{ .ReleaseRepo }}/releases | grep -oE '"tag_name": "release-cli-[^"]+"' | head -1 | cut -d'"' -f4) || true
    [ -z "$TAG" ] && TAG="{{ .ReleaseTag }}"
    ARCH=$(uname -m)
    case "$ARCH" in x86_64) BIN=conduit-linux-amd64;; aarch64) BIN=conduit-linux-arm64;; *) BIN=conduit-linux-amd64;; esac
    curl -sL -o /usr/local/bin/conduit "https://github.com/{{ .ReleaseRepo }}/releases/download/${TAG}/${BIN}"
    chmod +x /usr/local/bin/conduit
  - |
    printf '%s\n' \
      '[Unit]' \
      'Description=Conduit - Psiphon inproxy relay' \
      'After=network-online.target' \
      'Wants=network-online.target' \
      '' \
      '[Service]' \
      'Type=simple' \
      'ExecStart=/usr/local/bin/conduit start --data-dir /var/lib/conduit --max-clients {{ .MaxClients }} --bandwidth {{ .BandwidthArg }} --metrics-addr 0.0.0.0:9090' \
      'Restart=always' \
      'RestartSec=10' \
      '' \
      '[Install]' \
      'WantedBy=multi-user.target' > /etc/systemd/system/conduit.service
  - systemctl daemon-reload
  - systemctl enable conduit
  - systemctl start conduit
final_message: "Conduit server ready"
`

// CloudInitUserData returns cloud-init user data that installs the Conduit CLI from
// GitHub releases and runs it under systemd (no Docker).
func CloudInitUserData(opts SetupOpts) (string, error) {
	bandwidthArg := fmt.Sprintf("%.0f", opts.BandwidthMbps)
	if opts.BandwidthMbps < 0 {
		bandwidthArg = "-1"
	}
	data := struct {
		ReleaseRepo  string
		ReleaseTag   string
		MaxClients   int
		BandwidthArg string
	}{
		ReleaseRepo:  ConduitReleaseRepo,
		ReleaseTag:   "release-cli-0.1.0", // fallback if GitHub API fails
		MaxClients:   opts.MaxClients,
		BandwidthArg: bandwidthArg,
	}
	t, err := template.New("cloudinit").Parse(cloudInitTmpl)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

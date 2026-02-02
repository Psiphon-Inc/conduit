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
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

const (
	credentialsFileName = "hetzner_credentials.json"
	metricsUser         = "conduit"
)

// ServerCredentials holds authentication credentials for a server's metrics endpoint.
type ServerCredentials struct {
	IPv4     string `json:"ipv4"`
	User     string `json:"user"`
	Password string `json:"password"`
}

// CredentialsStore manages storage and retrieval of server credentials.
type CredentialsStore struct {
	filePath string
}

// NewCredentialsStore creates a new credentials store in the given directory.
func NewCredentialsStore(dataDir string) (*CredentialsStore, error) {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, fmt.Errorf("create credentials directory: %w", err)
	}
	return &CredentialsStore{
		filePath: filepath.Join(dataDir, credentialsFileName),
	}, nil
}

// GeneratePassword generates a secure random password.
func GeneratePassword() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate random password: %w", err)
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// LoadCredentials loads all stored credentials.
func (cs *CredentialsStore) LoadCredentials() (map[string]ServerCredentials, error) {
	data, err := os.ReadFile(cs.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return make(map[string]ServerCredentials), nil
		}
		return nil, fmt.Errorf("read credentials file: %w", err)
	}
	var creds map[string]ServerCredentials
	if err := json.Unmarshal(data, &creds); err != nil {
		return nil, fmt.Errorf("parse credentials: %w", err)
	}
	return creds, nil
}

// SaveCredentials saves credentials for a server.
func (cs *CredentialsStore) SaveCredentials(ipv4 string, password string) error {
	creds, err := cs.LoadCredentials()
	if err != nil {
		return err
	}
	creds[ipv4] = ServerCredentials{
		IPv4:     ipv4,
		User:     metricsUser,
		Password: password,
	}
	data, err := json.MarshalIndent(creds, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal credentials: %w", err)
	}
	if err := os.WriteFile(cs.filePath, data, 0600); err != nil {
		return fmt.Errorf("write credentials file: %w", err)
	}
	return nil
}

// GetCredentials retrieves credentials for a specific server IP.
func (cs *CredentialsStore) GetCredentials(ipv4 string) (ServerCredentials, bool) {
	creds, err := cs.LoadCredentials()
	if err != nil {
		return ServerCredentials{}, false
	}
	cred, ok := creds[ipv4]
	return cred, ok
}

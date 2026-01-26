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

package cmd

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/Psiphon-Inc/conduit/cli/internal/crypto"
	"github.com/Psiphon-Inc/conduit/cli/internal/ryve"
	"github.com/spf13/cobra"
)

var (
	ryveName string
)

var ryveCmd = &cobra.Command{
	Use:   "ryve",
	Short: "Generate Ryve app QR code for claiming rewards",
	Long: `Generate a QR code that can be scanned with the Ryve app to link your
Conduit instance and claim rewards for relaying traffic.

The QR code contains your Conduit's public key, allowing Ryve to attribute
the traffic you relay to your account.`,
	RunE: runRyve,
}

func init() {
	rootCmd.AddCommand(ryveCmd)
	ryveCmd.Flags().StringVarP(&ryveName, "name", "n", "", "custom name for your Conduit (shown in Ryve app)")
}

// persistedKey represents the key data saved to disk (matches config package)
type persistedKey struct {
	Mnemonic         string `json:"mnemonic"`
	PrivateKeyBase64 string `json:"privateKeyBase64"`
}

func runRyve(cmd *cobra.Command, args []string) error {
	keyPath := filepath.Join(GetDataDir(), "conduit_key.json")

	// Check if key file exists
	data, err := os.ReadFile(keyPath)
	if os.IsNotExist(err) {
		return fmt.Errorf("no key found at %s\nRun 'conduit start' first to generate keys", keyPath)
	}
	if err != nil {
		return fmt.Errorf("failed to read key file: %w", err)
	}

	// Parse the key file
	var pk persistedKey
	if err := json.Unmarshal(data, &pk); err != nil {
		return fmt.Errorf("failed to parse key file: %w", err)
	}

	if pk.PrivateKeyBase64 == "" {
		return fmt.Errorf("key file is missing privateKeyBase64")
	}

	// Decode and validate the key
	privateKeyBytes, err := base64.RawStdEncoding.DecodeString(pk.PrivateKeyBase64)
	if err != nil {
		// Try standard encoding as fallback
		privateKeyBytes, err = base64.StdEncoding.DecodeString(pk.PrivateKeyBase64)
		if err != nil {
			return fmt.Errorf("failed to decode private key: %w", err)
		}
	}

	// Validate it's a proper Ed25519 key
	_, err = crypto.ParsePrivateKey(privateKeyBytes)
	if err != nil {
		return fmt.Errorf("invalid key: %w", err)
	}

	// Generate the deep link
	// Use RawStdEncoding (base64 without padding) to get the 86-char format
	keyBase64 := base64.RawStdEncoding.EncodeToString(privateKeyBytes)

	deepLink, err := ryve.GenerateDeepLink(keyBase64, ryveName)
	if err != nil {
		return fmt.Errorf("failed to generate deep link: %w", err)
	}

	// Print QR code and URL
	fmt.Println()
	fmt.Println("Scan this QR code with the Ryve app to claim rewards:")
	fmt.Println()
	ryve.PrintQRAndURL(os.Stdout, deepLink)

	return nil
}

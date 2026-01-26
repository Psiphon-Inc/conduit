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

// Package ryve provides utilities for generating Ryve app deep links and QR codes
package ryve

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"rsc.io/qr"
)

// DeepLinkPrefix is the Ryve app deep link scheme for claiming conduits
const DeepLinkPrefix = "network.ryve.app://(app)/conduits?claim="

// ScanData represents the data structure for Ryve QR codes
type ScanData struct {
	Version int      `json:"version"`
	Data    DataBody `json:"data"`
}

// DataBody contains the key and optional name for the conduit
type DataBody struct {
	Key  string `json:"key"`
	Name string `json:"name,omitempty"`
}

// GenerateDeepLink creates a Ryve deep link URL from a base64-encoded keypair
// The key should be 86 characters (64 bytes encoded as base64 without padding)
func GenerateDeepLink(keyBase64 string, name string) (string, error) {
	if len(keyBase64) != 86 {
		return "", fmt.Errorf("invalid key length: expected 86 characters, got %d", len(keyBase64))
	}

	data := ScanData{
		Version: 1,
		Data: DataBody{
			Key:  keyBase64,
			Name: name,
		},
	}

	// Marshal to JSON
	jsonBytes, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("failed to marshal data: %w", err)
	}

	// Encode as base64url (URL-safe base64 with padding)
	encoded := base64.URLEncoding.EncodeToString(jsonBytes)

	return DeepLinkPrefix + encoded, nil
}

// PrintQR prints a compact ASCII QR code using Unicode half-block characters.
// This produces a QR code that is half the height of traditional ASCII QR codes.
func PrintQR(w io.Writer, data string) error {
	code, err := qr.Encode(data, qr.L)
	if err != nil {
		return fmt.Errorf("failed to encode QR: %w", err)
	}

	size := code.Size
	var sb strings.Builder

	// Using Unicode half-block characters to pack 2 rows into 1:
	// ▀ (U+2580) = top half block  (top=black, bottom=white)
	// ▄ (U+2584) = bottom half block (top=white, bottom=black)
	// █ (U+2588) = full block (both black)
	// " " space = both white

	// Add quiet zone (1 row = 2 QR rows worth of white)
	quietRow := strings.Repeat("█", size+2)
	sb.WriteString(quietRow + "\n")

	// Process 2 rows at a time
	for y := 0; y < size; y += 2 {
		sb.WriteString("█") // left quiet zone

		for x := 0; x < size; x++ {
			topBlack := code.Black(x, y)
			bottomBlack := false
			if y+1 < size {
				bottomBlack = code.Black(x, y+1)
			}

			// QR black = we want dark, QR white = we want light
			// Terminal: █ is filled, space is empty
			// We invert: QR black -> space (dark on light background looks better inverted)
			switch {
			case !topBlack && !bottomBlack:
				sb.WriteString("█") // both white -> full block
			case !topBlack && bottomBlack:
				sb.WriteString("▀") // top white, bottom black -> upper half
			case topBlack && !bottomBlack:
				sb.WriteString("▄") // top black, bottom white -> lower half
			case topBlack && bottomBlack:
				sb.WriteString(" ") // both black -> space
			}
		}

		sb.WriteString("█\n") // right quiet zone
	}

	// Bottom quiet zone
	sb.WriteString(quietRow + "\n")

	_, err = fmt.Fprint(w, sb.String())
	return err
}

// PrintQRAndURL prints the QR code followed by the URL to the given writer
func PrintQRAndURL(w io.Writer, deepLink string) error {
	if err := PrintQR(w, deepLink); err != nil {
		return err
	}
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Ryve Deep Link:")
	fmt.Fprintln(w, deepLink)
	return nil
}

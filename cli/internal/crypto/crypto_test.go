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

package crypto

import (
	"crypto/ed25519"
	"testing"
)

func TestGenerateAndDeriveMnemonicKeyPair(t *testing.T) {
	// Generate a mnemonic
	mnemonic, err := GenerateMnemonic()
	if err != nil {
		t.Fatalf("GenerateMnemonic failed: %v", err)
	}

	// Derive key pair from mnemonic with a fixed path
	const path = "m/0"
	kp, err := DeriveKeyPairFromMnemonic(mnemonic, path)
	if err != nil {
		t.Fatalf("DeriveKeyPairFromMnemonic failed: %v", err)
	}

	// Basic sanity checks on key lengths
	if got := len(kp.PrivateKey); got != ed25519.PrivateKeySize {
		t.Fatalf("unexpected private key length: got %d, want %d", got, ed25519.PrivateKeySize)
	}
	if got := len(kp.PublicKey); got != ed25519.PublicKeySize {
		t.Fatalf("unexpected public key length: got %d, want %d", got, ed25519.PublicKeySize)
	}

	// Check that the private key actually corresponds to the public key by signing
	msg := []byte("test message")
	sig := ed25519.Sign(ed25519.PrivateKey(kp.PrivateKey), msg)
	if !ed25519.Verify(ed25519.PublicKey(kp.PublicKey), msg, sig) {
		t.Fatalf("signature verification failed for derived key pair")
	}
}

func TestDeriveKeyPairFromMnemonicDeterministic(t *testing.T) {
	mnemonic, err := GenerateMnemonic()
	if err != nil {
		t.Fatalf("GenerateMnemonic failed: %v", err)
	}

	const path = "m/1"

	kp1, err := DeriveKeyPairFromMnemonic(mnemonic, path)
	if err != nil {
		t.Fatalf("first DeriveKeyPairFromMnemonic failed: %v", err)
	}

	kp2, err := DeriveKeyPairFromMnemonic(mnemonic, path)
	if err != nil {
		t.Fatalf("second DeriveKeyPairFromMnemonic failed: %v", err)
	}

	if string(kp1.PrivateKey) != string(kp2.PrivateKey) {
		t.Fatalf("derived private keys differ for same mnemonic/path")
	}
	if string(kp1.PublicKey) != string(kp2.PublicKey) {
		t.Fatalf("derived public keys differ for same mnemonic/path")
	}
}

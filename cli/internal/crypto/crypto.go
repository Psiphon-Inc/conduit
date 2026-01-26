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

// Package crypto provides cryptographic utilities for key generation
package crypto

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"

	"filippo.io/edwards25519"
	"github.com/tyler-smith/go-bip39"
	"golang.org/x/crypto/curve25519"
	"golang.org/x/crypto/hkdf"
)

// KeyPair represents an Ed25519 key pair
type KeyPair struct {
	PrivateKey []byte // 64 bytes: 32-byte seed + 32-byte public key
	PublicKey  []byte // 32 bytes
}

// GenerateKeyPair generates a new random Ed25519 key pair
func GenerateKeyPair() (*KeyPair, error) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("failed to generate key pair: %w", err)
	}

	return &KeyPair{
		PrivateKey: privateKey,
		PublicKey:  publicKey,
	}, nil
}

// GenerateMnemonic generates a new BIP-39 mnemonic phrase (24 words)
func GenerateMnemonic() (string, error) {
	entropy, err := bip39.NewEntropy(256) // 256 bits = 24 words
	if err != nil {
		return "", fmt.Errorf("failed to generate entropy: %w", err)
	}

	mnemonic, err := bip39.NewMnemonic(entropy)
	if err != nil {
		return "", fmt.Errorf("failed to generate mnemonic: %w", err)
	}

	return mnemonic, nil
}

// DeriveKeyPairFromMnemonic derives an Ed25519 key pair from a BIP-39 mnemonic
// Uses HKDF to derive the key from the mnemonic seed
func DeriveKeyPairFromMnemonic(mnemonic string, path string) (*KeyPair, error) {
	if !bip39.IsMnemonicValid(mnemonic) {
		return nil, fmt.Errorf("invalid mnemonic phrase")
	}

	// Convert mnemonic to seed (64 bytes)
	seed := bip39.NewSeed(mnemonic, "")

	// Use HKDF to derive a 32-byte Ed25519 seed
	// The path is used as additional info for domain separation
	info := []byte("conduit-inproxy-key")
	if path != "" {
		info = append(info, []byte(path)...)
	}

	hkdfReader := hkdf.New(sha256.New, seed, nil, info)
	ed25519Seed := make([]byte, 32)
	if _, err := io.ReadFull(hkdfReader, ed25519Seed); err != nil {
		return nil, fmt.Errorf("failed to derive key: %w", err)
	}

	// Generate Ed25519 key pair from seed
	privateKey := ed25519.NewKeyFromSeed(ed25519Seed)
	publicKey := privateKey.Public().(ed25519.PublicKey)

	return &KeyPair{
		PrivateKey: privateKey,
		PublicKey:  publicKey,
	}, nil
}

// ParsePrivateKey parses a 64-byte private key and returns a KeyPair
func ParsePrivateKey(privateKeyBytes []byte) (*KeyPair, error) {
	if len(privateKeyBytes) != 64 {
		return nil, fmt.Errorf("invalid private key length: expected 64, got %d", len(privateKeyBytes))
	}

	privateKey := ed25519.PrivateKey(privateKeyBytes)
	publicKey := privateKey.Public().(ed25519.PublicKey)

	return &KeyPair{
		PrivateKey: privateKey,
		PublicKey:  publicKey,
	}, nil
}

func KeyPairToBase64NoPad(kp *KeyPair) (string, error) {
	if kp == nil {
		return "", errors.New("key pair is nil")
	}
	if len(kp.PrivateKey) < 32 || len(kp.PublicKey) < 32 {
		return "", errors.New("keys are too short")
	}

	combined := make([]byte, 64)

	copy(combined[0:32], kp.PrivateKey[0:32])

	copy(combined[32:64], kp.PublicKey[0:32])

	return base64.RawStdEncoding.EncodeToString(combined), nil
}

func KeyPairToCurve25519Base64(kp *KeyPair) (string, error) {
	if kp == nil {
		return "", errors.New("key pair is nil")
	}
	if len(kp.PublicKey) < 32 {
		return "", errors.New("public key is too short")
	}

	p, err := new(edwards25519.Point).SetBytes(kp.PublicKey[:32])
	if err != nil {
		return "", fmt.Errorf("failed to convert public key: %w", err)
	}

	var curveKey [curve25519.PointSize]byte
	copy(curveKey[:], p.BytesMontgomery())

	return base64.RawStdEncoding.EncodeToString(curveKey[:]), nil
}

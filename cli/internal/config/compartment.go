package config

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const personalCompartmentIDByteLength = 32

type personalPairingTokenData struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type personalPairingTokenPayload struct {
	V    string                   `json:"v"`
	Data personalPairingTokenData `json:"data"`
}

type persistedCompartment struct {
	ID string `json:"id"`
}

// GeneratePersonalCompartmentID returns a base64 RawStd-encoded 32-byte
// personal compartment ID.
func GeneratePersonalCompartmentID() (string, error) {
	raw := make([]byte, personalCompartmentIDByteLength)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("failed to generate personal compartment id: %w", err)
	}
	return base64.RawStdEncoding.EncodeToString(raw), nil
}

// ValidatePersonalCompartmentID validates the personal compartment ID contract.
func ValidatePersonalCompartmentID(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("compartment id is empty")
	}
	if len(id) != 43 {
		return fmt.Errorf("compartment id must be exactly 43 characters")
	}
	if strings.ContainsAny(id, "-_=") {
		return fmt.Errorf("compartment id must use unpadded standard base64 alphabet")
	}
	for i := 0; i < len(id); i++ {
		c := id[i]
		isAlphaNum := c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9'
		if isAlphaNum || c == '+' || c == '/' {
			continue
		}
		return fmt.Errorf("compartment id contains invalid character %q", c)
	}

	decoded, err := base64.RawStdEncoding.DecodeString(id)
	if err != nil {
		return fmt.Errorf("invalid compartment id encoding: %w", err)
	}
	if len(decoded) != personalCompartmentIDByteLength {
		return fmt.Errorf("compartment id must decode to exactly %d bytes", personalCompartmentIDByteLength)
	}

	return nil
}

// NormalizePersonalCompartmentInput accepts either a raw compartment ID or a
// v1 personal pairing token and returns the validated compartment ID.
func NormalizePersonalCompartmentInput(input string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if err := ValidatePersonalCompartmentID(trimmed); err == nil {
		return trimmed, nil
	}

	payload, err := ParsePersonalPairingToken(trimmed)
	if err != nil {
		return "", fmt.Errorf("invalid compartment id or token: %w", err)
	}
	return payload.Data.ID, nil
}

// BuildPersonalPairingToken returns a v1 personal pairing share token.
func BuildPersonalPairingToken(id, name string) (string, error) {
	if err := ValidatePersonalCompartmentID(id); err != nil {
		return "", err
	}
	if strings.TrimSpace(name) == "" {
		return "", fmt.Errorf("name must be non-empty")
	}

	payload := personalPairingTokenPayload{
		V: "1",
		Data: personalPairingTokenData{
			ID:   id,
			Name: name,
		},
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal token payload: %w", err)
	}

	return base64.RawURLEncoding.EncodeToString(data), nil
}

// ParsePersonalPairingToken validates and parses a v1 personal pairing token.
func ParsePersonalPairingToken(token string) (*personalPairingTokenPayload, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, fmt.Errorf("token is empty")
	}

	decoded, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return nil, fmt.Errorf("token must be base64url without padding: %w", err)
	}

	var top map[string]json.RawMessage
	if err := json.Unmarshal(decoded, &top); err != nil {
		return nil, fmt.Errorf("token payload is not valid JSON: %w", err)
	}
	if len(top) != 2 {
		return nil, fmt.Errorf("token payload must contain exactly keys v and data")
	}
	if _, ok := top["v"]; !ok {
		return nil, fmt.Errorf("token payload missing key v")
	}
	if _, ok := top["data"]; !ok {
		return nil, fmt.Errorf("token payload missing key data")
	}

	var payload personalPairingTokenPayload
	if err := json.Unmarshal(decoded, &payload); err != nil {
		return nil, fmt.Errorf("invalid token payload: %w", err)
	}
	if payload.V != "1" {
		return nil, fmt.Errorf("token version must be string \"1\"")
	}

	var dataMap map[string]json.RawMessage
	if err := json.Unmarshal(top["data"], &dataMap); err != nil {
		return nil, fmt.Errorf("token data must be an object")
	}
	if len(dataMap) != 2 {
		return nil, fmt.Errorf("token data must contain exactly keys id and name")
	}
	if _, ok := dataMap["id"]; !ok {
		return nil, fmt.Errorf("token data missing key id")
	}
	if _, ok := dataMap["name"]; !ok {
		return nil, fmt.Errorf("token data missing key name")
	}

	if strings.TrimSpace(payload.Data.Name) == "" {
		return nil, fmt.Errorf("token data.name must be non-empty")
	}
	if err := ValidatePersonalCompartmentID(payload.Data.ID); err != nil {
		return nil, err
	}

	return &payload, nil
}

func personalCompartmentPath(dataDir string) string {
	return filepath.Join(dataDir, personalCompartmentFileName)
}

// SavePersonalCompartmentID writes the personal compartment ID to dataDir.
func SavePersonalCompartmentID(dataDir, id string) error {
	if err := ValidatePersonalCompartmentID(id); err != nil {
		return err
	}
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return fmt.Errorf("failed to create data directory: %w", err)
	}

	persisted := persistedCompartment{ID: id}
	encoded, err := json.MarshalIndent(persisted, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to encode personal compartment file: %w", err)
	}

	if err := os.WriteFile(personalCompartmentPath(dataDir), encoded, 0600); err != nil {
		return fmt.Errorf("failed to write personal compartment file: %w", err)
	}

	return nil
}

// LoadPersonalCompartmentID loads the persisted personal compartment ID.
func LoadPersonalCompartmentID(dataDir string) (string, error) {
	path := personalCompartmentPath(dataDir)
	encoded, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	var persisted persistedCompartment
	if err := json.Unmarshal(encoded, &persisted); err != nil {
		return "", fmt.Errorf("failed to parse personal compartment file: %w", err)
	}
	if err := ValidatePersonalCompartmentID(persisted.ID); err != nil {
		return "", fmt.Errorf("invalid persisted personal compartment id: %w", err)
	}

	return persisted.ID, nil
}

// PersonalCompartmentFilePath returns the location of persisted compartment ID.
func PersonalCompartmentFilePath(dataDir string) string {
	return personalCompartmentPath(dataDir)
}

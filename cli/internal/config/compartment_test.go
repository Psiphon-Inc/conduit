package config

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
)

func TestBuildAndParsePersonalPairingToken(t *testing.T) {
	id, err := GeneratePersonalCompartmentID()
	if err != nil {
		t.Fatalf("GeneratePersonalCompartmentID: %v", err)
	}

	token, err := BuildPersonalPairingToken(id, "my-station")
	if err != nil {
		t.Fatalf("BuildPersonalPairingToken: %v", err)
	}

	payload, err := ParsePersonalPairingToken(token)
	if err != nil {
		t.Fatalf("ParsePersonalPairingToken: %v", err)
	}
	if payload.V != "1" {
		t.Fatalf("unexpected version: %q", payload.V)
	}
	if payload.Data.ID != id {
		t.Fatalf("unexpected id: %q", payload.Data.ID)
	}
	if payload.Data.Name != "my-station" {
		t.Fatalf("unexpected name: %q", payload.Data.Name)
	}
}

func TestParsePersonalPairingTokenRejectsExtraKeys(t *testing.T) {
	id, err := GeneratePersonalCompartmentID()
	if err != nil {
		t.Fatalf("GeneratePersonalCompartmentID: %v", err)
	}

	payload := map[string]any{
		"v": "1",
		"data": map[string]any{
			"id":   id,
			"name": "x",
			"bad":  true,
		},
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	token := base64.RawURLEncoding.EncodeToString(encoded)

	_, err = ParsePersonalPairingToken(token)
	if err == nil {
		t.Fatalf("expected parse error")
	}
	if !strings.Contains(err.Error(), "exactly keys id and name") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNormalizePersonalCompartmentInputSupportsToken(t *testing.T) {
	id, err := GeneratePersonalCompartmentID()
	if err != nil {
		t.Fatalf("GeneratePersonalCompartmentID: %v", err)
	}
	token, err := BuildPersonalPairingToken(id, "station")
	if err != nil {
		t.Fatalf("BuildPersonalPairingToken: %v", err)
	}

	normalized, err := NormalizePersonalCompartmentInput(token)
	if err != nil {
		t.Fatalf("NormalizePersonalCompartmentInput: %v", err)
	}
	if normalized != id {
		t.Fatalf("normalized id = %q, expected %q", normalized, id)
	}
}

func TestBuildPersonalPairingTokenRejectsLongName(t *testing.T) {
	id, err := GeneratePersonalCompartmentID()
	if err != nil {
		t.Fatalf("GeneratePersonalCompartmentID: %v", err)
	}

	_, err = BuildPersonalPairingToken(id, strings.Repeat("a", PersonalPairingNameMaxLength+1))
	if err == nil {
		t.Fatalf("expected error for long name")
	}
	if !strings.Contains(err.Error(), "at most") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSaveAndLoadPersonalCompartmentID(t *testing.T) {
	id, err := GeneratePersonalCompartmentID()
	if err != nil {
		t.Fatalf("GeneratePersonalCompartmentID: %v", err)
	}
	dataDir := t.TempDir()

	if err := SavePersonalCompartmentID(dataDir, id); err != nil {
		t.Fatalf("SavePersonalCompartmentID: %v", err)
	}

	loaded, err := LoadPersonalCompartmentID(dataDir)
	if err != nil {
		t.Fatalf("LoadPersonalCompartmentID: %v", err)
	}
	if loaded != id {
		t.Fatalf("loaded id = %q, expected %q", loaded, id)
	}
}

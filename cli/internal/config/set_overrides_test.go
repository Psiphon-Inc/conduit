package config

import "testing"

func TestParseSetOverrides(t *testing.T) {
	id, err := GeneratePersonalCompartmentID()
	if err != nil {
		t.Fatalf("GeneratePersonalCompartmentID: %v", err)
	}
	token, err := BuildPersonalPairingToken(id, "station")
	if err != nil {
		t.Fatalf("BuildPersonalPairingToken: %v", err)
	}

	overrides, err := ParseSetOverrides([]string{
		"InproxyMaxCommonClients=17",
		"EmitInproxyProxyActivity=true",
		"InproxyProxyPersonalCompartmentID=" + token,
	})
	if err != nil {
		t.Fatalf("ParseSetOverrides: %v", err)
	}

	if got := overrides["InproxyMaxCommonClients"]; got == nil {
		t.Fatalf("missing InproxyMaxCommonClients")
	}
	if got := overrides["EmitInproxyProxyActivity"]; got != true {
		t.Fatalf("unexpected EmitInproxyProxyActivity: %v", got)
	}
	if got := overrides["InproxyProxyPersonalCompartmentID"]; got != id {
		t.Fatalf("unexpected compartment id: %v", got)
	}
}

func TestParseSetOverridesRejectsUnsupportedKey(t *testing.T) {
	_, err := ParseSetOverrides([]string{"UnknownField=1"})
	if err == nil {
		t.Fatalf("expected error")
	}
}

package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTempConfig(t *testing.T, dir string, contents string) string {
	t.Helper()
	path := filepath.Join(dir, "psiphon_config.json")
	if err := os.WriteFile(path, []byte(contents), 0600); err != nil {
		t.Fatalf("write config file: %v", err)
	}
	return path
}

func bandwidthBytes(mbps float64) int {
	return int(mbps * 1000 * 1000 / 8)
}

func TestLoadOrCreatePrecedence(t *testing.T) {
	tests := []struct {
		name                 string
		configJSON           string
		opts                 Options
		persistCompartment   bool
		expectedMaxCommon    int
		expectedMaxPersonal  int
		expectedBandwidthBps int
		expectedErrContains  string
	}{
		{
			name: "flag_overrides_config",
			configJSON: `{
  "InproxyMaxClients": 77,
  "InproxyLimitUpstreamBytesPerSecond": 1000,
  "InproxyLimitDownstreamBytesPerSecond": 900
}`,
			opts: Options{
				MaxCommonClients:    123,
				MaxCommonClientsSet: true,
				BandwidthSet:        true,
				BandwidthMbps:       10,
			},
			expectedMaxCommon:    123,
			expectedMaxPersonal:  0,
			expectedBandwidthBps: bandwidthBytes(10),
		},
		{
			name: "config_used_when_no_flag",
			configJSON: `{
  "InproxyMaxClients": 88,
  "InproxyLimitUpstreamBytesPerSecond": 900,
  "InproxyLimitDownstreamBytesPerSecond": 700
}`,
			opts:                 Options{},
			expectedMaxCommon:    88,
			expectedMaxPersonal:  0,
			expectedBandwidthBps: 700,
		},
		{
			name: "new_common_and_personal_fields",
			configJSON: `{
  "InproxyMaxCommonClients": 12,
  "InproxyMaxPersonalClients": 3
}`,
			persistCompartment:   true,
			opts:                 Options{},
			expectedMaxCommon:    12,
			expectedMaxPersonal:  3,
			expectedBandwidthBps: bandwidthBytes(DefaultBandwidthMbps),
		},
		{
			name: "personal_only_keeps_common_zero",
			configJSON: `{
  "InproxyMaxPersonalClients": 7
}`,
			persistCompartment:   true,
			opts:                 Options{},
			expectedMaxCommon:    0,
			expectedMaxPersonal:  7,
			expectedBandwidthBps: bandwidthBytes(DefaultBandwidthMbps),
		},
		{
			name: "personal_without_compartment_fails",
			configJSON: `{
  "InproxyMaxPersonalClients": 2
}`,
			opts:                Options{},
			expectedErrContains: "create compartment first with new-compartment-id command",
		},
		{
			name:                 "defaults_when_missing",
			configJSON:           `{}`,
			opts:                 Options{},
			expectedMaxCommon:    DefaultMaxClients,
			expectedMaxPersonal:  0,
			expectedBandwidthBps: bandwidthBytes(DefaultBandwidthMbps),
		},
		{
			name:       "explicit_zero_common_zero_personal_errors",
			configJSON: `{}`,
			opts: Options{
				MaxCommonClients:    0,
				MaxCommonClientsSet: true,
			},
			expectedErrContains: "at least one of --max-common-clients or --max-personal-clients must be greater than 0",
		},
		{
			name: "config_both_zero_errors",
			configJSON: `{
  "InproxyMaxCommonClients": 0,
  "InproxyMaxPersonalClients": 0
}`,
			opts:                Options{},
			expectedErrContains: "at least one of --max-common-clients or --max-personal-clients must be greater than 0",
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			dataDir := t.TempDir()
			configPath := writeTempConfig(t, dataDir, test.configJSON)
			if test.persistCompartment {
				compartmentID, err := GeneratePersonalCompartmentID()
				if err != nil {
					t.Fatalf("GeneratePersonalCompartmentID: %v", err)
				}
				if err := SavePersonalCompartmentID(dataDir, compartmentID); err != nil {
					t.Fatalf("SavePersonalCompartmentID: %v", err)
				}
			}
			opts := test.opts
			opts.DataDir = dataDir
			opts.PsiphonConfigPath = configPath

			cfg, err := LoadOrCreate(opts)
			if test.expectedErrContains != "" {
				if err == nil {
					t.Fatalf("expected error containing %q", test.expectedErrContains)
				}
				if !strings.Contains(err.Error(), test.expectedErrContains) {
					t.Fatalf("LoadOrCreate error = %q, expected to contain %q", err.Error(), test.expectedErrContains)
				}
				return
			}
			if err != nil {
				t.Fatalf("LoadOrCreate: %v", err)
			}

			if cfg.MaxCommonClients != test.expectedMaxCommon {
				t.Fatalf("MaxCommonClients = %d, expected %d", cfg.MaxCommonClients, test.expectedMaxCommon)
			}
			if cfg.MaxPersonalClients != test.expectedMaxPersonal {
				t.Fatalf("MaxPersonalClients = %d, expected %d", cfg.MaxPersonalClients, test.expectedMaxPersonal)
			}
			if cfg.BandwidthBytesPerSecond != test.expectedBandwidthBps {
				t.Fatalf("BandwidthBytesPerSecond = %d, expected %d", cfg.BandwidthBytesPerSecond, test.expectedBandwidthBps)
			}
		})
	}
}

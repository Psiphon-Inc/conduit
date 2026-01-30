package config

import (
	"os"
	"path/filepath"
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
		expectedMaxClients   int
		expectedBandwidthBps int
	}{
		{
			name: "flag_overrides_config",
			configJSON: `{
  "InproxyMaxClients": 77,
  "InproxyLimitUpstreamBytesPerSecond": 1000,
  "InproxyLimitDownstreamBytesPerSecond": 900
}`,
			opts: Options{
				MaxClients:    123,
				BandwidthSet:  true,
				BandwidthMbps: 10,
			},
			expectedMaxClients:   123,
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
			expectedMaxClients:   88,
			expectedBandwidthBps: 700,
		},
		{
			name:                 "defaults_when_missing",
			configJSON:           `{}`,
			opts:                 Options{},
			expectedMaxClients:   DefaultMaxClients,
			expectedBandwidthBps: bandwidthBytes(DefaultBandwidthMbps),
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			dataDir := t.TempDir()
			configPath := writeTempConfig(t, dataDir, test.configJSON)
			opts := test.opts
			opts.DataDir = dataDir
			opts.PsiphonConfigPath = configPath

			cfg, err := LoadOrCreate(opts)
			if err != nil {
				t.Fatalf("LoadOrCreate: %v", err)
			}

			if cfg.MaxClients != test.expectedMaxClients {
				t.Fatalf("MaxClients = %d, expected %d", cfg.MaxClients, test.expectedMaxClients)
			}
			if cfg.BandwidthBytesPerSecond != test.expectedBandwidthBps {
				t.Fatalf("BandwidthBytesPerSecond = %d, expected %d", cfg.BandwidthBytesPerSecond, test.expectedBandwidthBps)
			}
		})
	}
}

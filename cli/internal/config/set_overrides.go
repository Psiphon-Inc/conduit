package config

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

type overrideType int

const (
	overrideInt overrideType = iota
	overrideString
	overrideBool
)

var allowedSetKeys = map[string]overrideType{
	"EmitDiagnosticNotices":                       overrideBool,
	"EmitInproxyProxyActivity":                    overrideBool,
	"InproxyLimitDownstreamBytesPerSecond":        overrideInt,
	"InproxyLimitUpstreamBytesPerSecond":          overrideInt,
	"InproxyMaxClients":                           overrideInt,
	"InproxyMaxCommonClients":                     overrideInt,
	"InproxyMaxPersonalClients":                   overrideInt,
	"InproxyProxyPersonalCompartmentID":           overrideString,
	"InproxyReducedEndTime":                       overrideString,
	"InproxyReducedLimitDownstreamBytesPerSecond": overrideInt,
	"InproxyReducedLimitUpstreamBytesPerSecond":   overrideInt,
	"InproxyReducedMaxCommonClients":              overrideInt,
	"InproxyReducedStartTime":                     overrideString,
}

func copyOverrides(source map[string]interface{}) map[string]interface{} {
	if len(source) == 0 {
		return nil
	}
	clone := make(map[string]interface{}, len(source))
	for key, value := range source {
		clone[key] = value
	}
	return clone
}

func stripResolvedOverrides(overrides map[string]interface{}) map[string]interface{} {
	if len(overrides) == 0 {
		return nil
	}
	keys := []string{
		"InproxyMaxClients",
		"InproxyMaxCommonClients",
		"InproxyMaxPersonalClients",
		"InproxyProxyPersonalCompartmentID",
	}
	clone := copyOverrides(overrides)
	for _, key := range keys {
		delete(clone, key)
	}
	if len(clone) == 0 {
		return nil
	}
	return clone
}

func intOverrideValue(overrides map[string]interface{}, key string) (int, bool, error) {
	if len(overrides) == 0 {
		return 0, false, nil
	}
	raw, ok := overrides[key]
	if !ok {
		return 0, false, nil
	}
	value, err := toInt(raw)
	if err != nil {
		return 0, false, fmt.Errorf("invalid --set value for %s: %w", key, err)
	}
	return value, true, nil
}

func stringOverrideValue(overrides map[string]interface{}, key string) (string, bool, error) {
	if len(overrides) == 0 {
		return "", false, nil
	}
	raw, ok := overrides[key]
	if !ok {
		return "", false, nil
	}
	value, ok := raw.(string)
	if !ok {
		return "", false, fmt.Errorf("invalid --set value for %s: expected string", key)
	}
	return value, true, nil
}

// ParseSetOverrides parses --set key=value flags into an allowlisted map.
// Values are validated against the expected type for each key at parse time.
func ParseSetOverrides(entries []string) (map[string]interface{}, error) {
	if len(entries) == 0 {
		return nil, nil
	}

	overrides := make(map[string]interface{}, len(entries))
	for _, entry := range entries {
		parts := strings.SplitN(entry, "=", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid --set entry %q: expected key=value", entry)
		}
		key := strings.TrimSpace(parts[0])
		if key == "" {
			return nil, fmt.Errorf("invalid --set entry %q: key is empty", entry)
		}
		expectedType, ok := allowedSetKeys[key]
		if !ok {
			return nil, fmt.Errorf("unsupported --set key %q", key)
		}

		value, err := parseOverrideValue(parts[1])
		if err != nil {
			return nil, fmt.Errorf("invalid --set value for %s: %w", key, err)
		}

		// Validate parsed value matches the expected type for this key.
		switch expectedType {
		case overrideInt:
			if _, err := toInt(value); err != nil {
				return nil, fmt.Errorf("invalid --set value for %s: expected integer", key)
			}
		case overrideBool:
			if _, ok := value.(bool); !ok {
				return nil, fmt.Errorf("invalid --set value for %s: expected true or false", key)
			}
		case overrideString:
			if _, ok := value.(string); !ok {
				return nil, fmt.Errorf("invalid --set value for %s: expected string", key)
			}
		}

		if key == "InproxyProxyPersonalCompartmentID" {
			stringValue := value.(string)
			normalized, err := NormalizePersonalCompartmentInput(stringValue)
			if err != nil {
				return nil, err
			}
			value = normalized
		}

		overrides[key] = value
	}

	return overrides, nil
}

func parseOverrideValue(raw string) (interface{}, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", nil
	}

	if shouldParseAsJSON(trimmed) {
		decoder := json.NewDecoder(bytes.NewBufferString(trimmed))
		decoder.UseNumber()
		var value interface{}
		if err := decoder.Decode(&value); err != nil {
			return nil, err
		}
		return value, nil
	}

	return trimmed, nil
}

func shouldParseAsJSON(value string) bool {
	if value == "true" || value == "false" || value == "null" {
		return true
	}
	if strings.HasPrefix(value, "{") || strings.HasPrefix(value, "[") || strings.HasPrefix(value, "\"") {
		return true
	}
	if _, err := strconv.ParseInt(value, 10, 64); err == nil {
		return true
	}
	if _, err := strconv.ParseFloat(value, 64); err == nil {
		return true
	}
	return false
}

func toInt(value interface{}) (int, error) {
	switch v := value.(type) {
	case int:
		return v, nil
	case int8:
		return int(v), nil
	case int16:
		return int(v), nil
	case int32:
		return int(v), nil
	case int64:
		return int(v), nil
	case uint:
		return int(v), nil
	case uint8:
		return int(v), nil
	case uint16:
		return int(v), nil
	case uint32:
		return int(v), nil
	case uint64:
		return int(v), nil
	case float32:
		return int(v), nil
	case float64:
		return int(v), nil
	case json.Number:
		parsed, err := v.Int64()
		if err != nil {
			return 0, err
		}
		return int(parsed), nil
	default:
		return 0, fmt.Errorf("expected integer")
	}
}

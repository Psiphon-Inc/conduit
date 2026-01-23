//go:build embed_config

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

package config

import (
	_ "embed"
)

//go:embed psiphon_config.json
var embeddedPsiphonConfig []byte

// GetEmbeddedPsiphonConfig returns the embedded Psiphon config, if available
func GetEmbeddedPsiphonConfig() []byte {
	return embeddedPsiphonConfig
}

// HasEmbeddedConfig returns true if config was embedded at build time
func HasEmbeddedConfig() bool {
	return len(embeddedPsiphonConfig) > 0
}

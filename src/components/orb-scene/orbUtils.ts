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
import { interpolate } from "react-native-reanimated";

import type { OrbEvolutionLevel } from "@/src/components/orb-scene/OrbScene";

const MAX_LIGHTS_PER_LANE = 12;

/**
 * Returns a scale multiplier based on an orb's visual mode
 * (off / announcing / in_use) and the current pulse value.
 */
export function modeMultiplier(
    mode: number,
    pulse: number,
    config: {
        offMultiplier: number;
        announceMinMultiplier: number;
        announceMaxMultiplier: number;
        inUseMultiplier: number;
    },
): number {
    "worklet";
    if (mode < 0.5) {
        return config.offMultiplier;
    }
    if (mode < 1.5) {
        return interpolate(
            pulse,
            [0, 1],
            [config.announceMinMultiplier, config.announceMaxMultiplier],
        );
    }
    return config.inUseMultiplier;
}

/**
 * Clamps a connection light count to a valid range [0, MAX_LIGHTS_PER_LANE].
 */
export function clampLights(count: number): number {
    if (!Number.isFinite(count) || count <= 0) {
        return 0;
    }
    return Math.min(MAX_LIGHTS_PER_LANE, Math.floor(count));
}

/**
 * Parses a raw value (number or string) into a clamped OrbEvolutionLevel (0-3).
 * Returns null if the value cannot be resolved.
 */
export function resolveEvolutionLevel(
    value: unknown,
): OrbEvolutionLevel | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        if (value >= 3) {
            return 3;
        }
        if (value >= 2) {
            return 2;
        }
        if (value >= 1) {
            return 1;
        }
        return 0;
    }

    if (typeof value === "string") {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) {
            return resolveEvolutionLevel(parsed);
        }
    }

    return null;
}

/**
 * Maps an orb count to the corresponding OrbEvolutionLevel.
 */
export function toOrbLevelFromCount(count: number): OrbEvolutionLevel {
    if (!Number.isFinite(count) || count <= 0) {
        return 0;
    }
    if (count >= 3) {
        return 3;
    }
    if (count >= 2) {
        return 2;
    }
    return 1;
}

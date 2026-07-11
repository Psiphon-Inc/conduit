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
import { Asset } from "expo-asset";

import { soundAssets } from "@/src/sound/assets";
import { SOUND_EFFECT_VOLUME, SoundEffect } from "@/src/sound/types";

const audioElements = new Map<SoundEffect, HTMLAudioElement>();

function resolveAssetUri(effect: SoundEffect): string | null {
    // Metro's web asset resolution can yield a URI string, an object with a
    // `uri` field, or a numeric asset module ID (resolved via expo-asset).
    const requiredModule: unknown = soundAssets[effect];
    if (typeof requiredModule === "string") {
        return requiredModule;
    }
    if (
        requiredModule != null &&
        typeof requiredModule === "object" &&
        typeof (requiredModule as { uri?: unknown }).uri === "string"
    ) {
        return (requiredModule as { uri: string }).uri;
    }
    if (typeof requiredModule === "number") {
        try {
            return Asset.fromModule(requiredModule).uri;
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Imperatively play a sound effect using an HTMLAudioElement, cached per
 * effect and rewound before replay.
 */
export function playEffect(effect: SoundEffect): void {
    if (typeof Audio === "undefined") {
        return;
    }
    let element = audioElements.get(effect);
    if (!element) {
        const uri = resolveAssetUri(effect);
        if (!uri) {
            return;
        }
        element = new Audio(uri);
        element.volume = SOUND_EFFECT_VOLUME;
        audioElements.set(effect, element);
    }
    element.currentTime = 0;
    void element.play().catch(() => {
        // Autoplay restrictions or decode failures are non-fatal.
    });
}

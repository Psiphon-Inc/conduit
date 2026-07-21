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
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";

import { soundAssets } from "@/src/sound/assets";
import { SOUND_EFFECT_VOLUME, SoundEffect } from "@/src/sound/types";

let audioModeConfigured = false;
const players = new Map<SoundEffect, AudioPlayer>();

function configureAudioModeOnce(): void {
    if (audioModeConfigured) {
        return;
    }
    audioModeConfigured = true;
    // Non-negotiable: never play in iOS silent mode, and never interrupt or
    // stop other apps' audio (mix on iOS, duck briefly on Android).
    void setAudioModeAsync({
        playsInSilentMode: false,
        interruptionMode: "mixWithOthers",
        interruptionModeAndroid: "duckOthers",
        shouldPlayInBackground: false,
    }).catch(() => {
        // Best-effort; sound remains disabled-safe if this fails.
    });
}

/**
 * Imperatively play a sound effect. Players are lazily created on first use
 * and reused per effect (rewound before replay).
 */
export function playEffect(effect: SoundEffect): void {
    configureAudioModeOnce();
    const existing = players.get(effect);
    if (existing) {
        void existing
            .seekTo(0)
            .catch(() => {})
            .then(() => {
                try {
                    existing.play();
                } catch {
                    // Swallow: sound is best-effort.
                }
            });
        return;
    }
    const player = createAudioPlayer(soundAssets[effect]);
    player.volume = SOUND_EFFECT_VOLUME;
    players.set(effect, player);
    player.play();
}

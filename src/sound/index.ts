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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { isE2E } from "@/src/common/e2e";
import {
    ASYNCSTORAGE_SOUND_ENABLED_KEY,
    QUERYKEY_SOUND_ENABLED,
} from "@/src/constants";
import { playEffect } from "@/src/sound/player";
import { SoundEffect } from "@/src/sound/types";

export { SOUND_EFFECT_VOLUME } from "@/src/sound/types";
export type { SoundEffect } from "@/src/sound/types";

const PER_EFFECT_DEBOUNCE_MS = 300;
// Suppress `stationGoingOffline` if `warningAlert` played recently: an error
// stop also emits a STOPPED transition, which would otherwise double-sound.
const OFFLINE_AFTER_WARNING_SUPPRESSION_MS = 2000;

// Module-level cached preference. Default: sound on.
let soundEnabled = true;
// Query client captured from `useSoundEnabled` consumers so module-level
// setters/hydration can keep the react-query cache in sync.
let registeredQueryClient: QueryClient | null = null;
const lastPlayedAtMs: Partial<Record<SoundEffect, number>> = {};

const hapticForEffect: Record<SoundEffect, () => Promise<void>> = {
    stationGoingLive: () =>
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
    stationGoingOffline: () =>
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
    warningAlert: () =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    successConfirm: () =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    copyToClipboard: () =>
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
};

/**
 * Fire-and-forget playback of a sound effect plus its default haptic.
 * Never throws. No-ops entirely under E2E. The haptic fires even when the
 * sound preference is off (haptics are independent of the sound toggle),
 * unless `options.haptic === false`.
 */
export function playSound(
    effect: SoundEffect,
    options?: { haptic?: boolean },
): void {
    try {
        if (isE2E()) {
            return;
        }
        const nowMs = Date.now();
        const lastPlayed = lastPlayedAtMs[effect];
        if (
            lastPlayed !== undefined &&
            nowMs - lastPlayed < PER_EFFECT_DEBOUNCE_MS
        ) {
            return;
        }
        if (effect === "stationGoingOffline") {
            const warningPlayedAt = lastPlayedAtMs.warningAlert;
            if (
                warningPlayedAt !== undefined &&
                nowMs - warningPlayedAt < OFFLINE_AFTER_WARNING_SUPPRESSION_MS
            ) {
                return;
            }
        }
        lastPlayedAtMs[effect] = nowMs;
        if (options?.haptic !== false && Platform.OS !== "web") {
            try {
                void hapticForEffect[effect]().catch(() => {});
            } catch {
                // expo-haptics unavailable; ignore.
            }
        }
        if (!soundEnabled) {
            return;
        }
        playEffect(effect);
    } catch {
        // Sound is best-effort and must never affect app behavior.
    }
}

/**
 * Read the persisted sound preference once at app startup.
 */
export async function hydrateSoundPreference(): Promise<void> {
    try {
        const stored = await AsyncStorage.getItem(
            ASYNCSTORAGE_SOUND_ENABLED_KEY,
        );
        if (stored !== null) {
            soundEnabled = stored === "true";
        }
        registeredQueryClient?.setQueryData(
            [QUERYKEY_SOUND_ENABLED],
            soundEnabled,
        );
    } catch {
        // Keep the default (enabled).
    }
}

/**
 * Update the cached preference, persist it, and sync the react-query cache.
 * The in-memory cache updates synchronously, so an immediate `playSound`
 * after calling this reflects the new preference.
 */
export async function setSoundEnabled(enabled: boolean): Promise<void> {
    soundEnabled = enabled;
    registeredQueryClient?.setQueryData([QUERYKEY_SOUND_ENABLED], enabled);
    try {
        await AsyncStorage.setItem(
            ASYNCSTORAGE_SOUND_ENABLED_KEY,
            enabled ? "true" : "false",
        );
    } catch {
        // Preference stays applied in-memory for this session.
    }
}

/**
 * Cache-only hook exposing the sound preference for the settings UI.
 */
export function useSoundEnabled(): boolean {
    const queryClient = useQueryClient();
    registeredQueryClient = queryClient;
    const { data } = useQuery({
        queryKey: [QUERYKEY_SOUND_ENABLED],
        queryFn: async () => soundEnabled,
        initialData: soundEnabled,
        enabled: false,
    });
    return data;
}

/**
 * Test-only: reset module-level state between unit tests.
 */
export function resetSoundStateForTesting(): void {
    soundEnabled = true;
    registeredQueryClient = null;
    for (const key of Object.keys(lastPlayedAtMs) as SoundEffect[]) {
        delete lastPlayedAtMs[key];
    }
}

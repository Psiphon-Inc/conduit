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

/**
 * The set of in-app sound effects. Each effect maps to one audio asset in
 * `assets/audio/` and one default haptic (see `src/sound/index.ts`).
 */
export type SoundEffect =
    | "stationGoingLive"
    | "stationGoingOffline"
    | "warningAlert"
    | "successConfirm"
    | "copyToClipboard";

/**
 * Medium-low default playback volume per the sound design spec: satisfying
 * but not intrusive.
 */
export const SOUND_EFFECT_VOLUME = 0.5;

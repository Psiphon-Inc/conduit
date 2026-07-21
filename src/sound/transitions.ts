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
import { HostedStationPhase } from "@/src/hosted/experience/types";
import { SoundEffect } from "@/src/sound/types";

/**
 * Pure transition detectors for SoundTriggers, extracted for testability.
 */

/**
 * Maps a hosted station phase transition to a sound effect, or null.
 * `previousPhase === null` means no phase has been observed yet this app
 * session, so nothing plays on initial load/hydration.
 */
export function detectHostedPhaseSoundEffect(
    previousPhase: HostedStationPhase | null,
    nextPhase: HostedStationPhase,
): SoundEffect | null {
    if (previousPhase === null || previousPhase === nextPhase) {
        return null;
    }
    if (
        nextPhase === "active" &&
        (previousPhase === "provisioning" || previousPhase === "none")
    ) {
        return "stationGoingLive";
    }
    if (nextPhase === "suspended" && previousPhase === "active") {
        return "warningAlert";
    }
    return null;
}

/**
 * True when a connected-clients count transitions from an observed 0 to a
 * positive number. `previousCount === null` means no count was observed yet
 * this session, so a nonzero initial reading does not count as a transition.
 */
export function isFirstConnectTransition(
    previousCount: number | null,
    nextCount: number,
): boolean {
    return previousCount !== null && previousCount === 0 && nextCount > 0;
}

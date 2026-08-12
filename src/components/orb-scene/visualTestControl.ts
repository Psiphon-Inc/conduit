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
import {
    ConnectionLightMotionPlan,
    connectionLightLfoAtElapsed,
    connectionLightSeed,
    createConnectionLightMotionPlan,
} from "@/src/components/canvas/connectionLightMotion";

/**
 * Deterministic rendering control for visual golden-state capture.
 *
 * When `frozen` is true every autonomous animation source (frame callbacks,
 * repeating timings, springs, entry fades, unseeded randomness) is pinned to
 * a value derived from `progress`, so the same props always produce the same
 * frame on every platform and run.
 */
export interface VisualTestControl {
    frozen: boolean;
    /** Normalized scrub position in [0, 1]. */
    progress: number;
    /** Deterministic reduced-motion override; defaults to false. */
    reducedMotion?: boolean;
}

/**
 * The frozen scene scrub window. `progress` 0..1 maps linearly onto this many
 * milliseconds of connection-light clock time. Wide enough to reach any LFO
 * position of any seeded light (first sweep plus one full period).
 */
export const VISUAL_TEST_LIGHT_WINDOW_MS = 20000;

export function clampVisualProgress(progress: number): number {
    "worklet";
    if (!Number.isFinite(progress)) {
        return 0;
    }
    return Math.max(0, Math.min(1, progress));
}

/** Maps normalized scrub progress onto the frozen connection-light clock. */
export function visualTestLightElapsedMs(progress: number): number {
    "worklet";
    return clampVisualProgress(progress) * VISUAL_TEST_LIGHT_WINDOW_MS;
}

/** Inverse of the default inOut(quad) easing used by connection lights. */
function inverseConnectionLightEasing(eased: number): number {
    const clamped = Math.max(0, Math.min(1, eased));
    if (clamped < 0.5) {
        return Math.sqrt(clamped / 2);
    }
    return 1 - Math.sqrt((1 - clamped) / 2);
}

/**
 * Solves for the elapsed time at which a light's LFO reaches `targetLfo`.
 * Prefers the initial forward sweep; positions the light on the first
 * descending sweep when the spawn phase already passed the target.
 */
export function connectionLightElapsedForLfo(
    plan: ConnectionLightMotionPlan,
    targetLfo: number,
): number {
    const target = Math.max(-1, Math.min(1, targetLfo));
    if (target >= plan.initialPhase) {
        const easedProgress =
            plan.initialPhase >= 1
                ? 1
                : (target - plan.initialPhase) / (1 - plan.initialPhase);
        return inverseConnectionLightEasing(easedProgress) * plan.firstSweepMs;
    }
    // First repeat sweep runs 1 -> -1 over one period.
    const easedProgress = (1 - target) / 2;
    return (
        plan.firstSweepMs +
        inverseConnectionLightEasing(easedProgress) * plan.periodMs
    );
}

/**
 * Normalized frozen progress that places the given scene light at
 * `targetLfo` (-1 spawn, -0.6 orb edge, 0 orb center, 1 exited).
 * Scene light seeds derive from `${laneId}-${lightIndex}`, matching
 * OrbScene's lane light construction.
 */
export function visualProgressForLightLfo(
    laneId: string,
    lightIndex: number,
    targetLfo: number,
): number {
    const seed = connectionLightSeed(`${laneId}-${lightIndex}`);
    // Timing fields of the plan are radius-independent; radius only shapes
    // the spawn point, so any positive radius resolves the same schedule.
    const plan = createConnectionLightMotionPlan(seed, 100);
    const elapsed = connectionLightElapsedForLfo(plan, targetLfo);
    return clampVisualProgress(elapsed / VISUAL_TEST_LIGHT_WINDOW_MS);
}

export function assertVisualLfoReachable(
    laneId: string,
    lightIndex: number,
    targetLfo: number,
): { progress: number; achievedLfo: number } {
    const progress = visualProgressForLightLfo(laneId, lightIndex, targetLfo);
    const seed = connectionLightSeed(`${laneId}-${lightIndex}`);
    const plan = createConnectionLightMotionPlan(seed, 100);
    const achievedLfo = connectionLightLfoAtElapsed(
        plan,
        visualTestLightElapsedMs(progress),
    );
    return { progress, achievedLfo };
}

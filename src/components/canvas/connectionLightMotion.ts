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

export const CONNECTION_LIGHT_PERIOD_MS = 5000;
export const CONNECTION_LIGHT_BLUR_SIGMA = 2;
const CONNECTION_LIGHT_FALLOFF_SIGMAS = 3;
export const CONNECTION_LIGHT_MOTION_BUFFER_STRIDE = 3;

export interface ConnectionLightMotionPlan {
    spawnX: number;
    spawnY: number;
    periodMs: number;
    initialPhase: number;
    firstSweepMs: number;
}

export interface ConnectionLightPoint {
    x: number;
    y: number;
}

export interface ConnectionLightMotionSpec {
    motionPlan: ConnectionLightMotionPlan;
    orbRadius: number;
    midPoint: ConnectionLightPoint;
    secondLastPoint: ConnectionLightPoint;
    endPoint: ConnectionLightPoint;
}

export function connectionLightMotionBufferOffset(index: number): number {
    "worklet";
    return index * CONNECTION_LIGHT_MOTION_BUFFER_STRIDE;
}

export function connectionLightGradientRadii(orbRadius: number): {
    coreRadius: number;
    outerRadius: number;
    corePosition: number;
} {
    "worklet";
    const coreRadius = orbRadius / 10;
    const outerRadius =
        coreRadius +
        CONNECTION_LIGHT_BLUR_SIGMA * CONNECTION_LIGHT_FALLOFF_SIGMAS;
    return {
        coreRadius,
        outerRadius,
        corePosition: coreRadius / outerRadius,
    };
}

/** DJB2 hash producing the stable unsigned seed used by scene lights. */
export function connectionLightSeed(key: string): number {
    let hash = 5381;
    for (let index = 0; index < key.length; index++) {
        hash = ((hash << 5) + hash + key.charCodeAt(index)) | 0;
    }
    return hash >>> 0;
}

export function createConnectionLightMotionPlanFromRandomValues(
    orbRadius: number,
    spawnXRangeScale: number,
    verticalBias: number,
    angleRandom: number,
    distanceRandom: number,
    periodRandom: number,
    phaseRandom: number,
): ConnectionLightMotionPlan {
    "worklet";
    const resolvedSpawnXRangeScale = Math.max(0, spawnXRangeScale);
    const resolvedVerticalBias = Math.max(0, Math.min(1, verticalBias));
    const wedgeHalf = (Math.PI / 3) * (1 - 0.5 * resolvedVerticalBias);
    const spawnAngle = Math.PI / 2 + (angleRandom - 0.5) * 2 * wedgeHalf;
    const spawnDistance =
        orbRadius * (1.8 + distanceRandom * 0.8) * resolvedSpawnXRangeScale;
    const periodMs = CONNECTION_LIGHT_PERIOD_MS * (0.7 + periodRandom * 0.6);
    const initialPhase = -1 + phaseRandom * 2;

    return {
        spawnX: Math.cos(spawnAngle) * spawnDistance,
        spawnY: Math.sin(spawnAngle) * spawnDistance,
        periodMs,
        initialPhase,
        firstSweepMs: Math.max(1, ((1 - initialPhase) / 2) * periodMs),
    };
}

/** Reproduces the existing avalanche-mixed LCG and its first four samples. */
export function createConnectionLightMotionPlan(
    seed: number,
    orbRadius: number,
    spawnXRangeScale = 1,
    verticalBias = 0,
): ConnectionLightMotionPlan {
    "worklet";
    let lcgState = seed;
    lcgState = Math.imul(lcgState ^ (lcgState >>> 16), 0x45d9f3b) | 0;
    lcgState = Math.imul(lcgState ^ (lcgState >>> 16), 0x45d9f3b) | 0;
    lcgState = (lcgState ^ (lcgState >>> 16)) | 0;
    const nextRandom = (): number => {
        lcgState = (Math.imul(lcgState, 1664525) + 1013904223) | 0;
        return (lcgState >>> 0) / 4294967296;
    };

    return createConnectionLightMotionPlanFromRandomValues(
        orbRadius,
        spawnXRangeScale,
        verticalBias,
        nextRandom(),
        nextRandom(),
        nextRandom(),
        nextRandom(),
    );
}

/** Matches Reanimated's default withTiming easing: inOut(quad). */
function connectionLightDefaultEasing(value: number): number {
    "worklet";
    if (value < 0.5) {
        const doubled = value * 2;
        return (doubled * doubled) / 2;
    }
    const doubledInverse = (1 - value) * 2;
    return 1 - (doubledInverse * doubledInverse) / 2;
}

/** Resolves the legacy first forward sweep followed by an endless ping-pong. */
export function connectionLightLfoAtElapsed(
    plan: ConnectionLightMotionPlan,
    elapsedMs: number,
): number {
    "worklet";
    const elapsed = Math.max(0, elapsedMs);
    if (elapsed < plan.firstSweepMs) {
        const progress = connectionLightDefaultEasing(
            elapsed / plan.firstSweepMs,
        );
        return plan.initialPhase + (1 - plan.initialPhase) * progress;
    }

    const repeatElapsed = elapsed - plan.firstSweepMs;
    const sweep = Math.floor(repeatElapsed / plan.periodMs);
    const sweepProgress = connectionLightDefaultEasing(
        (repeatElapsed % plan.periodMs) / plan.periodMs,
    );
    return sweep % 2 === 0 ? 1 - 2 * sweepProgress : -1 + 2 * sweepProgress;
}

export function connectionLightTrajectoryAtLfo(
    lfo: number,
    spawn: ConnectionLightPoint,
    orbRadius: number,
    midPoint: ConnectionLightPoint,
    secondLastPoint: ConnectionLightPoint,
    endPoint: ConnectionLightPoint,
): ConnectionLightPoint {
    "worklet";
    const spawnDistance = Math.sqrt(spawn.x * spawn.x + spawn.y * spawn.y);
    const edgeScale = spawnDistance > 0 ? orbRadius / spawnDistance : 0;
    const edgePoint = {
        x: spawn.x * edgeScale,
        y: spawn.y * edgeScale,
    };
    let from = spawn;
    let to = edgePoint;
    let fromLfo = -1;
    let toLfo = -0.6;
    if (lfo > 0.6) {
        from = secondLastPoint;
        to = endPoint;
        fromLfo = 0.6;
        toLfo = 1;
    } else if (lfo > 0) {
        from = midPoint;
        to = secondLastPoint;
        fromLfo = 0;
        toLfo = 0.6;
    } else if (lfo > -0.6) {
        from = edgePoint;
        to = midPoint;
        fromLfo = -0.6;
        toLfo = 0;
    }
    const progress = (lfo - fromLfo) / (toLfo - fromLfo);
    return {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
    };
}

/** Evaluates each logical light into contiguous [lfo, x, y] slots. */
export function evaluateConnectionLightMotionBuffer(
    specs: readonly ConnectionLightMotionSpec[],
    elapsedMs: number,
): number[] {
    "worklet";
    const buffer = new Array<number>(
        specs.length * CONNECTION_LIGHT_MOTION_BUFFER_STRIDE,
    );
    for (let index = 0; index < specs.length; index++) {
        const spec = specs[index];
        const lfo = connectionLightLfoAtElapsed(spec.motionPlan, elapsedMs);
        const trajectory = connectionLightTrajectoryAtLfo(
            lfo,
            {
                x: spec.motionPlan.spawnX,
                y: spec.motionPlan.spawnY,
            },
            spec.orbRadius,
            spec.midPoint,
            spec.secondLastPoint,
            spec.endPoint,
        );
        const offset = connectionLightMotionBufferOffset(index);
        buffer[offset] = lfo;
        buffer[offset + 1] = trajectory.x;
        buffer[offset + 2] = trajectory.y;
    }
    return buffer;
}

export function connectionLightProxyEnvelope(lfo: number): number {
    "worklet";
    const distance = Math.abs(lfo);
    const inner = distance < 0.5 ? Math.max(0, 1 - (0.5 - distance) / 0.25) : 1;
    const outer = distance > 0.5 ? Math.max(0, 1 - (distance - 0.5) / 0.35) : 1;
    return inner * outer;
}

/*
 * Copyright (c) 2024, Psiphon Inc.
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
// must be rendered within a canvas
import {
    Blur,
    Circle,
    Group,
    SkPoint,
    interpolateColors,
    interpolateVector,
    vec,
} from "@shopify/react-native-skia";
import React from "react";
import {
    cancelAnimation,
    useDerivedValue,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";

import { palette } from "@/src/styles";

/**
 * Ball of light that will take a semi-random trajectory through the origin and
 * up to the top of the canvas. Must be rendered within a Canvas.
 **/
export function ConduitConnectionLight({
    active,
    canvasWidth: _canvasWidth,
    orbRadius,
    midPoint,
    secondLastPoint,
    endPoint,
    randomize,
    spawnXRangeScale = 1,
    verticalBias = 0,
    x0init = 0,
    y0init = 0,
    deterministicSeed,
    asMorphProxy = false,
}: {
    active: boolean;
    canvasWidth: number;
    orbRadius: number;
    midPoint: SkPoint;
    secondLastPoint: SkPoint;
    endPoint: SkPoint;
    randomize: boolean;
    spawnXRangeScale?: number;
    verticalBias?: number;
    x0init?: number;
    y0init?: number;
    /** When set, replace Math.random() with a seeded LCG so two
     *  instances sharing the same seed produce identical trajectories. */
    deterministicSeed?: number;
    /** Render as a morph-layer proxy: larger circle, no blur, opacity
     *  peaks near the orb center so it only contributes to the
     *  blur+threshold goo compositing near the orb surface. */
    asMorphProxy?: boolean;
}) {
    // A connection light will be rendered for every connection to the Conduit.
    // Each light will start at a random position horizontally off-screen, fly
    // into the Conduit Orb, then fly up to the Psiphon Network dots.
    // Each orb will do this in a loop, choosing new random initial values each
    // time. A lfo will animate from -1 to 1.
    // Store lfo in a ReactRef so that we don't reset it on re-render.
    const lfo = React.useRef(useSharedValue(-1));
    const periodMs = 5000;

    const y0 = useSharedValue(y0init);
    const x0 = useSharedValue(x0init);

    // interpolate trajectory between semi-random vectors
    const trajectory = useDerivedValue(() => {
        // Place the approach point on the orb edge, in the
        // direction of the spawn point, so it lines up with
        // the orb boundary regardless of orb size.
        const spawnDist = Math.sqrt(x0.value * x0.value + y0.value * y0.value);
        const edgeScale = spawnDist > 0 ? orbRadius / spawnDist : 0;
        return interpolateVector(
            lfo.current.value,
            [-1, -0.6, 0, 0.6, 1],
            [
                vec(x0.value, y0.value),
                vec(x0.value * edgeScale, y0.value * edgeScale),
                midPoint,
                secondLastPoint,
                endPoint,
            ],
        );
    });

    // animate light color along trajectory:
    // fade in → purple (bottom) → peach (top) → fade out
    const lightColor = useDerivedValue(() => {
        return interpolateColors(
            lfo.current.value,
            [-0.9, -0.6, 0.6, 0.9],
            [
                palette.transparent,
                palette.mauve,
                palette.peach,
                palette.transparent,
            ],
        );
    });

    // use opacity to fade out when a connection is dropped
    const lightOpacity = useSharedValue(0);

    // Morph proxy opacity: tight ring at the orb edge only.
    // Zero inside the orb body and far away — the proxy only
    // contributes to the blur+threshold goo right at the surface.
    const morphProxyOpacity = useDerivedValue(() => {
        const dist = Math.abs(lfo.current.value);
        // Smooth ramps on both sides of the orb edge (|lfo| ≈ 0.5):
        // gradual fade-in from inside, gradual fade-out outside.
        const inner = dist < 0.5 ? Math.max(0, 1 - (0.5 - dist) / 0.25) : 1;
        const outer = dist > 0.5 ? Math.max(0, 1 - (dist - 0.5) / 0.35) : 1;
        const proximity = inner * outer;
        return proximity * lightOpacity.value;
    });

    function randomizeXYSpin() {
        "worklet";
        // Seeded LCG for deterministic sync between morph proxy and
        // visible light instances sharing the same seed. Falls back to
        // Math.random when no seed is provided.
        // Seeded LCG with avalanche mixing so similar DJB2 seeds
        // diverge immediately. Warm up 4 rounds before use.
        let _lcg = deterministicSeed ?? 0;
        _lcg = Math.imul(_lcg ^ (_lcg >>> 16), 0x45d9f3b) | 0;
        _lcg = Math.imul(_lcg ^ (_lcg >>> 16), 0x45d9f3b) | 0;
        _lcg = (_lcg ^ (_lcg >>> 16)) | 0;
        const lcg = (): number => {
            _lcg = (Math.imul(_lcg, 1664525) + 1013904223) | 0;
            return (_lcg >>> 0) / 4294967296;
        };
        const rand = deterministicSeed != null ? lcg : Math.random;

        const resolvedSpawnXRangeScale = Math.max(0, spawnXRangeScale);
        const resolvedVerticalBias = Math.max(0, Math.min(1, verticalBias));
        // Spawn anywhere in the bottom 1/3 wedge of the orb (±60° from
        // directly below). verticalBias narrows the wedge toward center.
        const wedgeHalf = (Math.PI / 3) * (1 - 0.5 * resolvedVerticalBias);
        const spawnAngle = Math.PI / 2 + (rand() - 0.5) * 2 * wedgeHalf;
        const spawnDist =
            orbRadius * (1.8 + rand() * 0.8) * resolvedSpawnXRangeScale;
        x0.value = Math.cos(spawnAngle) * spawnDist;
        y0.value = Math.sin(spawnAngle) * spawnDist;
        // Vary period ±30% so lights drift apart and never re-synchronize.
        // Start each light at a random phase in the cycle so they are
        // visually scattered from the very first frame, rather than all
        // beginning off-screen and sweeping in together.
        const drift = 0.7 + rand() * 0.6;
        const randomPeriod = periodMs * drift;
        const randomPhase = -1 + rand() * 2;
        const firstSweepFraction = (1 - randomPhase) / 2;
        const firstSweepMs = Math.max(1, firstSweepFraction * randomPeriod);
        lfo.current.value = randomPhase;
        lfo.current.value = withSequence(
            // finish the current forward sweep from the random start
            withTiming(1, { duration: firstSweepMs }),
            // then ping-pong indefinitely
            withRepeat(withTiming(-1, { duration: randomPeriod }), -1, true),
        );
    }

    React.useEffect(() => {
        if (active) {
            lightOpacity.value = withTiming(1, { duration: 1000 });
            if (randomize) {
                randomizeXYSpin();
            } else {
                lfo.current.value = withRepeat(
                    withTiming(1, {
                        duration: periodMs,
                    }),
                    -1,
                    true,
                );
            }
        } else {
            lightOpacity.value = withTiming(0, { duration: 1000 }, () => {
                cancelAnimation(lfo.current);
            });
        }
    }, [active]);

    React.useEffect(() => {
        return () => {
            cancelAnimation(lfo.current);
            lfo.current.value = -1;
        };
    }, []);

    if (asMorphProxy) {
        // Larger circle with moderate alpha — invisible alone after
        // the morph layer's blur+threshold, but when overlapping the
        // orb's blurred alpha field the combined value crosses the
        // threshold, producing an organic goo extension.
        return (
            <Circle
                c={trajectory}
                r={orbRadius / 8}
                opacity={morphProxyOpacity}
                color="rgba(255,235,225,0.85)"
            />
        );
    }

    return (
        <Group>
            <Circle
                c={trajectory}
                r={orbRadius / 10}
                color={lightColor}
                opacity={lightOpacity}
            />
            <Blur blur={2} />
        </Group>
    );
}

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
    Circle,
    RadialGradient,
    SkPoint,
    interpolateColors,
} from "@shopify/react-native-skia";
import React from "react";
import {
    SharedValue,
    cancelAnimation,
    useDerivedValue,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";

import {
    CONNECTION_LIGHT_BLUR_SIGMA,
    CONNECTION_LIGHT_PERIOD_MS,
    connectionLightGradientRadii,
    connectionLightMotionBufferOffset,
    connectionLightProxyEnvelope,
    connectionLightTrajectoryAtLfo,
    createConnectionLightMotionPlanFromRandomValues,
} from "@/src/components/canvas/connectionLightMotion";
import { palette } from "@/src/styles";

interface ConnectionLightRenderProps {
    trajectory: SharedValue<SkPoint>;
    lightOpacity: SharedValue<number>;
    orbRadius: number;
}

interface MorphConnectionLightProps extends ConnectionLightRenderProps {
    lfo: SharedValue<number>;
}

function MorphConnectionLightProxy({
    trajectory,
    lightOpacity,
    orbRadius,
    lfo,
}: MorphConnectionLightProps) {
    const morphProxyOpacity = useDerivedValue(() => {
        return connectionLightProxyEnvelope(lfo.value) * lightOpacity.value;
    });

    return (
        <Circle
            c={trajectory}
            r={orbRadius / 8}
            opacity={morphProxyOpacity}
            color="rgba(255,235,225,0.85)"
        />
    );
}

function VisibleConnectionLight({
    trajectory,
    lightOpacity,
    orbRadius,
    lfo,
}: MorphConnectionLightProps) {
    const { coreRadius, outerRadius, corePosition } =
        connectionLightGradientRadii(orbRadius);
    const lightGradientColors = useDerivedValue(() => {
        const color = interpolateColors(
            lfo.value,
            [-0.9, -0.6, 0.6, 0.9],
            [
                palette.transparent,
                palette.mauve,
                palette.peach,
                palette.transparent,
            ],
        );
        const [red, green, blue, alpha] = color;
        return [
            color,
            color,
            [red, green, blue, alpha * 0.6065306597],
            [red, green, blue, alpha * 0.1353352832],
            [red, green, blue, 0],
        ];
    });
    const gradientPositions = [
        0,
        corePosition,
        (coreRadius + CONNECTION_LIGHT_BLUR_SIGMA) / outerRadius,
        (coreRadius + CONNECTION_LIGHT_BLUR_SIGMA * 2) / outerRadius,
        1,
    ];

    return (
        <Circle c={trajectory} r={outerRadius} opacity={lightOpacity}>
            <RadialGradient
                c={trajectory}
                r={outerRadius}
                colors={lightGradientColors}
                positions={gradientPositions}
            />
        </Circle>
    );
}

/**
 * Ball of light that will take a semi-random trajectory through the origin and
 * up to the top of the canvas. Must be rendered within a Canvas.
 **/
export function ConduitConnectionLight({
    active,
    orbRadius,
    midPoint,
    secondLastPoint,
    endPoint,
    randomize,
    spawnXRangeScale = 1,
    verticalBias = 0,
    x0init = 0,
    y0init = 0,
    asMorphProxy = false,
    sharedMotionBuffer,
    sharedMotionIndex,
}: {
    active: boolean;
    orbRadius: number;
    midPoint: SkPoint;
    secondLastPoint: SkPoint;
    endPoint: SkPoint;
    randomize: boolean;
    spawnXRangeScale?: number;
    verticalBias?: number;
    x0init?: number;
    y0init?: number;
    /** Render as a morph-layer proxy: larger circle, no blur, opacity
     *  peaks near the orb center so it only contributes to the
     *  blur+threshold goo compositing near the orb surface. */
    asMorphProxy?: boolean;
    /** Scene-level [lfo, x, y] slots. Must be paired with sharedMotionIndex. */
    sharedMotionBuffer?: SharedValue<number[]>;
    /** Logical light slot in sharedMotionBuffer. */
    sharedMotionIndex?: number;
}) {
    // A connection light will be rendered for every connection to the Conduit.
    // Each light will start at a random position horizontally off-screen, fly
    // into the Conduit Orb, then fly up to the Psiphon Network dots.
    // Each orb will do this in a loop, choosing new random initial values each
    // time. A lfo will animate from -1 to 1.
    // Store lfo in a ReactRef so that we don't reset it on re-render.
    const lfo = React.useRef(useSharedValue(-1));
    const periodMs = CONNECTION_LIGHT_PERIOD_MS;

    const y0 = useSharedValue(y0init);
    const x0 = useSharedValue(x0init);

    const usesSharedMotion =
        sharedMotionBuffer != null &&
        sharedMotionIndex != null &&
        sharedMotionIndex >= 0;
    const resolvedLfo = useDerivedValue(() => {
        if (
            usesSharedMotion &&
            sharedMotionBuffer != null &&
            sharedMotionIndex != null
        ) {
            const offset = connectionLightMotionBufferOffset(sharedMotionIndex);
            return sharedMotionBuffer.value[offset] ?? -1;
        }
        return lfo.current.value;
    }, [sharedMotionBuffer, sharedMotionIndex, usesSharedMotion]);

    // interpolate trajectory between semi-random vectors
    const trajectory = useDerivedValue(() => {
        if (
            usesSharedMotion &&
            sharedMotionBuffer != null &&
            sharedMotionIndex != null
        ) {
            const offset = connectionLightMotionBufferOffset(sharedMotionIndex);
            const buffer = sharedMotionBuffer.value;
            return {
                x: buffer[offset + 1] ?? x0.value,
                y: buffer[offset + 2] ?? y0.value,
            };
        }
        const spawn = { x: x0.value, y: y0.value };
        return connectionLightTrajectoryAtLfo(
            resolvedLfo.value,
            spawn,
            orbRadius,
            midPoint,
            secondLastPoint,
            endPoint,
        );
    }, [
        endPoint,
        midPoint,
        orbRadius,
        secondLastPoint,
        sharedMotionBuffer,
        sharedMotionIndex,
        usesSharedMotion,
    ]);

    // use opacity to fade out when a connection is dropped
    const lightOpacity = useSharedValue(0);

    function randomizeXYSpin() {
        "worklet";
        const plan = createConnectionLightMotionPlanFromRandomValues(
            orbRadius,
            spawnXRangeScale,
            verticalBias,
            Math.random(),
            Math.random(),
            Math.random(),
            Math.random(),
        );
        x0.value = plan.spawnX;
        y0.value = plan.spawnY;
        lfo.current.value = plan.initialPhase;
        lfo.current.value = withSequence(
            withTiming(1, { duration: plan.firstSweepMs }),
            withRepeat(withTiming(-1, { duration: plan.periodMs }), -1, true),
        );
    }

    React.useEffect(() => {
        if (active) {
            lightOpacity.value = withTiming(1, { duration: 1000 });
            if (usesSharedMotion) {
                cancelAnimation(lfo.current);
                return;
            } else if (randomize) {
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
    }, [active, usesSharedMotion]);

    React.useEffect(() => {
        return () => {
            cancelAnimation(lfo.current);
            lfo.current.value = -1;
        };
    }, []);

    if (asMorphProxy) {
        return (
            <MorphConnectionLightProxy
                trajectory={trajectory}
                lightOpacity={lightOpacity}
                orbRadius={orbRadius}
                lfo={resolvedLfo}
            />
        );
    }

    return (
        <VisibleConnectionLight
            trajectory={trajectory}
            lightOpacity={lightOpacity}
            orbRadius={orbRadius}
            lfo={resolvedLfo}
        />
    );
}

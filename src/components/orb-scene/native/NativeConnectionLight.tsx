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
import React from "react";
import { StyleSheet } from "react-native";
import Animated, {
    SharedValue,
    cancelAnimation,
    useAnimatedProps,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import {
    CONNECTION_LIGHT_PERIOD_MS,
    ConnectionLightPoint,
    connectionLightGradientRadii,
    connectionLightLfoAtElapsed,
    connectionLightMotionBufferOffset,
    connectionLightTrajectoryAtLfo,
    createConnectionLightMotionPlan,
    createConnectionLightMotionPlanFromRandomValues,
} from "@/src/components/canvas/connectionLightMotion";
import { palette } from "@/src/styles";

// Matches the alpha falloff the Skia light's radial gradient encoded:
// solid core, then exp(-k/2) steps across two blur sigmas, then transparent.
const FALLOFF_ALPHAS = [1, 1, 0.6065306597, 0.1353352832, 0];
const WHITE_PULSE_PEAK_LFO = 0.45;
const WHITE_PULSE_HALF_WIDTH = 0.15;
const WHITE_PULSE_MAX_OPACITY = 0.6;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function LightSprite({
    color,
    orbRadius,
    whitePulseOpacity,
}: {
    color: string;
    orbRadius: number;
    whitePulseOpacity: SharedValue<number>;
}) {
    const { coreRadius, outerRadius, corePosition } =
        connectionLightGradientRadii(orbRadius);
    const positions = [
        0,
        corePosition,
        (coreRadius + 2) / outerRadius,
        (coreRadius + 4) / outerRadius,
        1,
    ];
    // useId emits ":r1:"-style ids whose colons are unsafe inside url(#...)
    // references on web; sanitize to alphanumerics.
    const gradientId = `light-${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
    const pulseGradientId = `${gradientId}-pulse`;
    const pulseAnimatedProps = useAnimatedProps(() => ({
        fillOpacity: whitePulseOpacity.value,
    }));

    return (
        <Svg
            width={outerRadius * 2}
            height={outerRadius * 2}
            style={StyleSheet.absoluteFill}
        >
            <Defs>
                <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
                    {positions.map((position, index) => (
                        <Stop
                            key={index}
                            offset={position}
                            stopColor={color}
                            stopOpacity={FALLOFF_ALPHAS[index]}
                        />
                    ))}
                </RadialGradient>
                <RadialGradient id={pulseGradientId} cx="50%" cy="50%" r="50%">
                    <Stop offset="0%" stopColor="#fff" stopOpacity={1} />
                    <Stop offset="28%" stopColor="#fff" stopOpacity={0.9} />
                    <Stop offset="62%" stopColor="#fff" stopOpacity={0.34} />
                    <Stop offset="100%" stopColor="#fff" stopOpacity={0} />
                </RadialGradient>
            </Defs>
            <Circle
                cx={outerRadius}
                cy={outerRadius}
                r={outerRadius}
                fill={`url(#${gradientId})`}
            />
            <AnimatedCircle
                cx={outerRadius}
                cy={outerRadius}
                r={outerRadius}
                fill={`url(#${pulseGradientId})`}
                animatedProps={pulseAnimatedProps}
            />
        </Svg>
    );
}

/**
 * Non-Skia replacement for ConduitConnectionLight. Renders the light as an
 * absolutely positioned animated wrapper around one static radial-gradient
 * sprite. A radial white glow pulses at two points just inside the orb edges,
 * preserving the old Skia absorption cue without another animated wrapper or
 * per-light metaball tail image.
 */
export function NativeConnectionLight({
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
    sharedMotionBuffer,
    sharedMotionIndex,
    seed,
    visualFrozenElapsedMs,
}: {
    active: boolean;
    orbRadius: number;
    midPoint: ConnectionLightPoint;
    secondLastPoint: ConnectionLightPoint;
    endPoint: ConnectionLightPoint;
    randomize: boolean;
    spawnXRangeScale?: number;
    verticalBias?: number;
    x0init?: number;
    y0init?: number;
    /** Scene-level [lfo, x, y] slots. Must be paired with sharedMotionIndex. */
    sharedMotionBuffer?: SharedValue<number[]>;
    /** Logical light slot in sharedMotionBuffer. */
    sharedMotionIndex?: number;
    /** Deterministic motion seed used instead of Math.random spawning. */
    seed?: number;
    /** Visual-test freeze: pin opacity and the standalone LFO to this
     *  elapsed time instead of running autonomous animations. */
    visualFrozenElapsedMs?: number;
}) {
    const lfo = React.useRef(useSharedValue(-1));
    const y0 = useSharedValue(y0init);
    const x0 = useSharedValue(x0init);
    const lightOpacity = useSharedValue(0);

    const usesSharedMotion =
        sharedMotionBuffer != null &&
        sharedMotionIndex != null &&
        sharedMotionIndex >= 0;

    function resolveMotionPlan() {
        if (seed != null) {
            return createConnectionLightMotionPlan(
                seed,
                orbRadius,
                spawnXRangeScale,
                verticalBias,
            );
        }
        return createConnectionLightMotionPlanFromRandomValues(
            orbRadius,
            spawnXRangeScale,
            verticalBias,
            Math.random(),
            Math.random(),
            Math.random(),
            Math.random(),
        );
    }

    React.useEffect(() => {
        if (visualFrozenElapsedMs != null) {
            cancelAnimation(lightOpacity);
            cancelAnimation(lfo.current);
            lightOpacity.value = active ? 1 : 0;
            if (!usesSharedMotion) {
                const plan = resolveMotionPlan();
                x0.value = plan.spawnX;
                y0.value = plan.spawnY;
                lfo.current.value = connectionLightLfoAtElapsed(
                    plan,
                    visualFrozenElapsedMs,
                );
            }
            return;
        }
        if (active) {
            lightOpacity.value = withTiming(1, { duration: 1000 });
            if (usesSharedMotion) {
                cancelAnimation(lfo.current);
                return;
            } else if (randomize) {
                const plan = resolveMotionPlan();
                x0.value = plan.spawnX;
                y0.value = plan.spawnY;
                lfo.current.value = plan.initialPhase;
                lfo.current.value = withSequence(
                    withTiming(1, { duration: plan.firstSweepMs }),
                    withRepeat(
                        withTiming(-1, { duration: plan.periodMs }),
                        -1,
                        true,
                    ),
                );
            } else {
                lfo.current.value = withRepeat(
                    withTiming(1, { duration: CONNECTION_LIGHT_PERIOD_MS }),
                    -1,
                    true,
                );
            }
        } else {
            lightOpacity.value = withTiming(0, { duration: 1000 }, () => {
                cancelAnimation(lfo.current);
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, usesSharedMotion, seed, visualFrozenElapsedMs]);

    React.useEffect(() => {
        const lfoValue = lfo.current;
        return () => {
            cancelAnimation(lfoValue);
            lfoValue.value = -1;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const { outerRadius } = connectionLightGradientRadii(orbRadius);

    // The frame resolution below is deliberately inlined into each
    // useAnimatedStyle rather than hoisted into a shared helper: a helper
    // built with React.useCallback is a JS-thread closure, so Reanimated
    // cannot see the shared values it reads and never re-evaluates the
    // style on the UI thread. That regressed these lights to updating only
    // on React re-render (visibly jumping every several seconds) instead of
    // animating per frame.
    const motionOffset =
        sharedMotionIndex != null
            ? connectionLightMotionBufferOffset(sharedMotionIndex)
            : 0;

    const wrapperStyle = useAnimatedStyle(() => {
        let lfoValue: number;
        let x: number;
        let y: number;
        if (usesSharedMotion && sharedMotionBuffer != null) {
            const buffer = sharedMotionBuffer.value;
            lfoValue = buffer[motionOffset] ?? -1;
            x = buffer[motionOffset + 1] ?? x0.value;
            y = buffer[motionOffset + 2] ?? y0.value;
        } else {
            lfoValue = lfo.current.value;
            const trajectory = connectionLightTrajectoryAtLfo(
                lfoValue,
                { x: x0.value, y: y0.value },
                orbRadius,
                midPoint,
                secondLastPoint,
                endPoint,
            );
            x = trajectory.x;
            y = trajectory.y;
        }
        // Envelope matching interpolateColors' transparent end ramps:
        // fade in across [-0.9, -0.6], fade out across [0.6, 0.9].
        const fadeIn = Math.max(0, Math.min(1, (lfoValue + 0.9) / 0.3));
        const fadeOut = Math.max(0, Math.min(1, (0.9 - lfoValue) / 0.3));
        return {
            opacity: lightOpacity.value * fadeIn * fadeOut,
            transform: [{ translateX: x }, { translateY: y }],
        };
    }, [
        endPoint,
        lightOpacity,
        midPoint,
        motionOffset,
        orbRadius,
        secondLastPoint,
        sharedMotionBuffer,
        usesSharedMotion,
        x0,
        y0,
    ]);

    const whitePulseOpacity = useDerivedValue(() => {
        const lfoValue =
            usesSharedMotion && sharedMotionBuffer != null
                ? (sharedMotionBuffer.value[motionOffset] ?? -1)
                : lfo.current.value;
        // A pair of linear triangular peaks at -0.45 and +0.45. The orb
        // edges are at +/-0.6, so each glow peaks one quarter of the way
        // inside and is fully gone at the edge and center.
        const distanceFromPeak = Math.abs(
            Math.abs(lfoValue) - WHITE_PULSE_PEAK_LFO,
        );
        const peakStrength = Math.max(
            0,
            1 - distanceFromPeak / WHITE_PULSE_HALF_WIDTH,
        );
        return peakStrength * WHITE_PULSE_MAX_OPACITY;
    }, [motionOffset, sharedMotionBuffer, usesSharedMotion]);

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                {
                    position: "absolute",
                    left: -outerRadius,
                    top: -outerRadius,
                    width: outerRadius * 2,
                    height: outerRadius * 2,
                },
                wrapperStyle,
            ]}
        >
            <LightSprite
                color={palette.peach}
                orbRadius={orbRadius}
                whitePulseOpacity={whitePulseOpacity}
            />
        </Animated.View>
    );
}

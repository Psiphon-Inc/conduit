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
import { useTranslation } from "react-i18next";
import { I18nManager, StyleSheet, Text, View } from "react-native";
import Animated, {
    Easing,
    type SharedValue,
    cancelAnimation,
    useAnimatedStyle,
    useDerivedValue,
    useFrameCallback,
    useSharedValue,
    withDelay,
    withRepeat,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import {
    ConnectionLightMotionSpec,
    connectionLightSeed,
    createConnectionLightMotionPlan,
    evaluateConnectionLightMotionBuffer,
} from "@/src/components/canvas/connectionLightMotion";
import { NativeConnectionLight } from "@/src/components/orb-scene/native/NativeConnectionLight";
import { NativeParticleTail } from "@/src/components/orb-scene/native/NativeParticleTail";
import {
    InnerShadowLayer,
    OrbBodyGradient,
} from "@/src/components/orb-scene/native/orbLayers";
import {
    VisualTestControl,
    clampVisualProgress,
    visualTestLightElapsedMs,
} from "@/src/components/orb-scene/visualTestControl";
import { useAppIsActive } from "@/src/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

const MAX_HOSTED_LIGHTS = 8;

// The Skia version cycled the body gradient's outer color through this
// palette with interpolateColors; the native version renders one static
// gradient layer per stop and crossfades wrapper opacity.
const ORB_CYCLE_COLORS = [
    palette.deepMauve,
    palette.peach,
    palette.fadedMauve,
    palette.mauve,
    palette.fadedMauve,
];

// Shared static SVG layers live in orbLayers.tsx.

/**
 * Native (non-Skia) HostedMiniOrb renderer: the plan's phase 7 pilot.
 * Mirrors HostedMiniOrb's props; lights run through a local shared motion
 * buffer so particle tails and visual-test freezing come from the same
 * machinery the main scene uses.
 */
export function HostedMiniOrbNative({
    label,
    connectedCount,
    connectingCount,
    width,
    height,
    applyBlur = false,
    showDetails = true,
    visualTest,
    lightSeedKey,
}: {
    label: string;
    connectedCount: number;
    connectingCount: number;
    width: number;
    height: number;
    applyBlur?: boolean;
    showDetails?: boolean;
    visualTest?: VisualTestControl;
    lightSeedKey?: string;
}) {
    const { t } = useTranslation();
    const appIsActive = useAppIsActive();
    const finalOrbRadius = width / 4;
    const orbCenterY = height / 2;
    const isActive = connectedCount > 0;
    const isConnecting = connectingCount > 0;
    const frozen = visualTest?.frozen === true;
    const frozenProgress = clampVisualProgress(visualTest?.progress ?? 0);
    const clampedLights = Math.max(
        0,
        Math.min(MAX_HOSTED_LIGHTS, connectedCount),
    );

    // Unseeded mounts still get deterministic per-mount variety.
    const seedBase = React.useMemo(
        () => lightSeedKey ?? `mini-${Math.floor(Math.random() * 0xffffffff)}`,
        [lightSeedKey],
    );
    const lightSeeds = React.useMemo(
        () =>
            Array.from({ length: MAX_HOSTED_LIGHTS }, (_, index) =>
                connectionLightSeed(`${seedBase}-${index}`),
            ),
        [seedBase],
    );
    const lightSpecs = React.useMemo<ConnectionLightMotionSpec[]>(
        () =>
            lightSeeds.map((seed) => ({
                motionPlan: createConnectionLightMotionPlan(
                    seed,
                    finalOrbRadius,
                ),
                orbRadius: finalOrbRadius,
                midPoint: { x: 0, y: 0 },
                secondLastPoint: { x: 0, y: -finalOrbRadius },
                endPoint: { x: 0, y: -(orbCenterY * 1.35) },
            })),
        [finalOrbRadius, lightSeeds, orbCenterY],
    );

    const lightElapsedMs = useSharedValue(0);
    const lightClock = useFrameCallback((frame) => {
        if (frame.timeSincePreviousFrame != null) {
            lightElapsedMs.value += frame.timeSincePreviousFrame;
        }
    }, false);

    React.useEffect(() => {
        if (frozen) {
            lightClock.setActive(false);
            lightElapsedMs.value = visualTestLightElapsedMs(frozenProgress);
            return;
        }
        lightClock.setActive(appIsActive && clampedLights > 0);
        return () => lightClock.setActive(false);
    }, [
        appIsActive,
        clampedLights,
        frozen,
        frozenProgress,
        lightClock,
        lightElapsedMs,
    ]);

    const motionBuffer = useDerivedValue(
        () =>
            evaluateConnectionLightMotionBuffer(
                lightSpecs,
                lightElapsedMs.value,
            ),
        [lightElapsedMs, lightSpecs],
    );

    // Mount scale-in matching the Skia radius spring (radius 0 -> final).
    const mountScale = useSharedValue(frozen ? 1 : 0);
    React.useEffect(() => {
        if (frozen) {
            cancelAnimation(mountScale);
            mountScale.value = 1;
            return;
        }
        mountScale.value = withDelay(
            80,
            withSpring(1, {
                mass: 1.2,
                damping: 10,
                stiffness: 100,
            }),
        );
    }, [frozen, mountScale]);

    // Gradient color cycle position (0..3, ping-pong while active).
    const colorIndex = useSharedValue(0);
    React.useEffect(() => {
        if (frozen) {
            cancelAnimation(colorIndex);
            colorIndex.value =
                isActive || isConnecting ? frozenProgress * 3 : 0;
            return;
        }
        if (isActive || isConnecting) {
            colorIndex.value = withRepeat(
                withTiming(3, {
                    duration: isActive ? 2200 : 3200,
                    easing: Easing.linear,
                }),
                -1,
                true,
            );
            return;
        }
        cancelAnimation(colorIndex);
        colorIndex.value = withTiming(0, { duration: 500 });
    }, [colorIndex, frozen, frozenProgress, isActive, isConnecting]);

    const activityWeight = useSharedValue(isActive || isConnecting ? 1 : 0);
    React.useEffect(() => {
        if (frozen) {
            cancelAnimation(activityWeight);
            activityWeight.value = isActive || isConnecting ? 1 : 0;
            return;
        }
        activityWeight.value = withTiming(isActive || isConnecting ? 1 : 0, {
            duration: 500,
        });
    }, [activityWeight, frozen, isActive, isConnecting]);

    const orbWrapperStyle = useAnimatedStyle(
        () => ({ transform: [{ scale: mountScale.value }] }),
        [mountScale],
    );

    const sceneStyle = {
        width,
        height,
        backgroundColor: "transparent",
        // Scene-blur approximation: soften and dim rather than pulling in a
        // platform live-blur dependency (plan phase 8 decision).
        opacity: applyBlur ? 0.82 : 1,
    } as const;

    return (
        <View style={sceneStyle}>
            {/* Zero-size anchor at the orb center; lights, tails, and orb
                layers all position relative to it. */}
            <View
                style={{
                    position: "absolute",
                    left: width / 2,
                    top: orbCenterY,
                    width: 0,
                    height: 0,
                }}
            >
                {/* Lights behind the translucent orb body so they dim
                    through the shell as they cross the rim, matching
                    OrbSceneNative. */}
                {[...Array(MAX_HOSTED_LIGHTS).keys()].map((index) => (
                    <NativeConnectionLight
                        key={index}
                        active={clampedLights > index}
                        orbRadius={finalOrbRadius}
                        midPoint={{ x: 0, y: 0 }}
                        secondLastPoint={{ x: 0, y: -finalOrbRadius }}
                        endPoint={{ x: 0, y: -(orbCenterY * 1.35) }}
                        randomize={true}
                        sharedMotionBuffer={motionBuffer}
                        sharedMotionIndex={index}
                        visualFrozenElapsedMs={
                            frozen
                                ? visualTestLightElapsedMs(frozenProgress)
                                : undefined
                        }
                    />
                ))}

                <Animated.View
                    style={[
                        {
                            position: "absolute",
                            left: -finalOrbRadius,
                            top: -finalOrbRadius,
                            width: finalOrbRadius * 2,
                            height: finalOrbRadius * 2,
                        },
                        orbWrapperStyle,
                    ]}
                >
                    {ORB_CYCLE_COLORS.map((color, index) => (
                        <OrbCycleLayer
                            key={`cycle-${index}`}
                            index={index}
                            radius={finalOrbRadius}
                            color={color}
                            colorIndex={colorIndex}
                        />
                    ))}
                    <InnerShadowLayer
                        id="mini-shadow-mauve"
                        radius={finalOrbRadius}
                        color={palette.mauve}
                        dx={10}
                        dy={10}
                    />
                    <IdleActiveShadow
                        radius={finalOrbRadius}
                        activityWeight={activityWeight}
                    />
                    <Svg
                        width={finalOrbRadius * 2}
                        height={finalOrbRadius * 2}
                        style={StyleSheet.absoluteFillObject}
                    >
                        <Circle
                            cx={finalOrbRadius}
                            cy={finalOrbRadius}
                            r={finalOrbRadius - 1}
                            stroke={palette.deepMauve}
                            strokeWidth={1.5}
                            strokeOpacity={0.3}
                            fill="none"
                        />
                    </Svg>
                </Animated.View>

                {/* Tails render last, above both the orb body and the light
                    sprites, matching OrbSceneNative: the mask's inside lump
                    has to sit over the body, and the neck has to merge into
                    the light rather than be interrupted by its core. */}
                {[...Array(clampedLights).keys()].map((index) => (
                    <NativeParticleTail
                        key={`tail-${index}`}
                        orbRadius={finalOrbRadius}
                        sharedMotionBuffer={motionBuffer}
                        sharedMotionIndex={index}
                    />
                ))}
            </View>

            {showDetails ? (
                <View
                    style={[
                        ss.absolute,
                        {
                            transform: [
                                { translateY: orbCenterY },
                                {
                                    translateX: I18nManager.isRTL
                                        ? (-1 * width) / 2
                                        : width / 2,
                                },
                            ],
                            left: -width / 2,
                            top: finalOrbRadius + 8,
                            width,
                            alignItems: "center",
                            gap: 2,
                        },
                    ]}
                >
                    <Text style={[ss.bodyFont, ss.blackText]}>{label}</Text>
                    <Text style={[ss.tinyFont, ss.blackText]}>
                        {t("MINI_ORB_STATUS_I18N.string", {
                            connected: connectedCount,
                            connecting: connectingCount,
                        })}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

function OrbCycleLayer({
    index,
    radius,
    color,
    colorIndex,
}: {
    index: number;
    radius: number;
    color: string;
    colorIndex: SharedValue<number>;
}) {
    const layerStyle = useAnimatedStyle(() => {
        // Stacked crossfade: the base layer stays opaque, each higher layer
        // fades in over the one below as the cycle position passes it.
        const opacity =
            index === 0
                ? 1
                : Math.min(1, Math.max(0, colorIndex.value - (index - 1)));
        return { opacity };
    }, [colorIndex, index]);

    return (
        <Animated.View style={[StyleSheet.absoluteFillObject, layerStyle]}>
            <OrbBodyGradient
                id={`mini-cycle-${index}`}
                radius={radius}
                innerColor={palette.white}
                outerColor={color}
            />
        </Animated.View>
    );
}

function IdleActiveShadow({
    radius,
    activityWeight,
}: {
    radius: number;
    activityWeight: SharedValue<number>;
}) {
    const idleStyle = useAnimatedStyle(
        () => ({ opacity: 1 - activityWeight.value }),
        [activityWeight],
    );
    const activeStyle = useAnimatedStyle(
        () => ({ opacity: activityWeight.value }),
        [activityWeight],
    );
    return (
        <>
            <Animated.View style={[StyleSheet.absoluteFillObject, idleStyle]}>
                <InnerShadowLayer
                    id="mini-shadow-idle"
                    radius={radius}
                    color={palette.peachyMauve}
                    dx={-10}
                    dy={-10}
                />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFillObject, activeStyle]}>
                <InnerShadowLayer
                    id="mini-shadow-active"
                    radius={radius}
                    color={palette.peach}
                    dx={-10}
                    dy={-10}
                />
            </Animated.View>
        </>
    );
}

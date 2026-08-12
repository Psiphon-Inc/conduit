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
import { StyleSheet, Text, View } from "react-native";
import Animated, {
    Easing,
    SharedValue,
    cancelAnimation,
    useAnimatedReaction,
    useAnimatedStyle,
    useDerivedValue,
    useFrameCallback,
    useSharedValue,
    withDelay,
    withRepeat,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { isE2E, isPerf } from "@/src/common/e2e";
import {
    ConnectionLightMotionSpec,
    connectionLightSeed,
    createConnectionLightMotionPlan,
    evaluateConnectionLightMotionBuffer,
} from "@/src/components/canvas/connectionLightMotion";
import { OrbGestureOverlay } from "@/src/components/orb-scene/OrbGestureOverlay";
import type {
    OrbSceneProps,
    OrbSceneProvisioningMarker,
    OrbVisualMode,
} from "@/src/components/orb-scene/OrbScene";
import { NativeConnectionLight } from "@/src/components/orb-scene/native/NativeConnectionLight";
import { calculateThresholdedOrbBodyProfile } from "@/src/components/orb-scene/orbBodyProfile";
import { calculateOrbGlowGradientStops } from "@/src/components/orb-scene/orbSceneMath";
import {
    DEFAULT_ORB_SLOT_MAP,
    HOSTED_ORB_THEME_LEVEL,
    ORB_LAYOUTS,
    OrbTheme,
    PROVISIONING_MARKER_GLOW_COLORS,
    PROVISIONING_MARKER_GLOW_POSITIONS,
    PROVISIONING_MARKER_ORBIT_DURATION_MS,
    SCENE_THEMES,
} from "@/src/components/orb-scene/orbSceneTheme";
import {
    clampLights,
    modeMultiplier,
} from "@/src/components/orb-scene/orbUtils";
import {
    clampVisualProgress,
    visualTestLightElapsedMs,
} from "@/src/components/orb-scene/visualTestControl";
import { useAppIsActive, useReducedMotionPreference } from "@/src/hooks";
import { sharedStyles as ss } from "@/src/styles";

const CONNECTION_LIGHT_MID_POINT = { x: 0, y: 0 };
const MAIN_ORB_GLOW_SIGMA_RATIO = 0.2;
const MAIN_ORB_GLOW_OPACITY = 0.45;
const GLOW_MODE_MAX = 1.25;
const ORB_BODY_ALPHA_SCALE = 0.72;
const ORB_SHADOW_ALPHA_SCALE = 0.58;
function parseRgb(value: string): { r: number; g: number; b: number } {
    const match = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(value);
    if (!match) {
        return { r: 255, g: 255, b: 255 };
    }
    return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
    };
}

function parseRgba(value: string): { color: string; opacity: number } {
    const match =
        /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(
            value,
        );
    if (!match) {
        return { color: value, opacity: 1 };
    }
    return {
        color: `rgb(${match[1]},${match[2]},${match[3]})`,
        opacity: Number(match[4]),
    };
}

function seededTopRightPhase(id: string): number {
    return 0.82 + ((connectionLightSeed(id) % 1000) / 1000) * 0.12;
}

function normalizeProvisioningMarkers(
    markers?: OrbSceneProvisioningMarker[],
): OrbSceneProvisioningMarker[] {
    const seen = new Set<string>();
    const normalized: OrbSceneProvisioningMarker[] = [];
    for (const marker of markers ?? []) {
        if (
            marker.id.length === 0 ||
            !Number.isInteger(marker.orbIndex) ||
            seen.has(marker.id)
        ) {
            continue;
        }
        seen.add(marker.id);
        normalized.push(marker);
    }
    return normalized;
}

interface RenderedProvisioningMarker extends OrbSceneProvisioningMarker {
    active: boolean;
}

/**
 * One theme level's static paint for an orb: glow, body, edge, morph-ring,
 * and inner-shadow layers baked as SVG gradients in a 2*glowRadius box.
 * Mode transitions animate the glow/shadow wrapper opacities only.
 */
function OrbThemeLayers({
    idPrefix,
    baseRadius,
    theme,
    modeIndex,
    pulse,
}: {
    idPrefix: string;
    baseRadius: number;
    theme: OrbTheme;
    modeIndex: SharedValue<number>;
    pulse: SharedValue<number>;
}) {
    const glowStops = calculateOrbGlowGradientStops(
        baseRadius,
        baseRadius * MAIN_ORB_GLOW_SIGMA_RATIO,
    );
    const box = glowStops.outerRadius * 2;
    const center = box / 2;
    const bodyRadius = baseRadius;
    const bodyProfile = React.useMemo(
        () =>
            calculateThresholdedOrbBodyProfile({
                innerColor: {
                    ...parseRgb(theme.radialInner.rgb),
                    alpha: theme.radialInner.alpha,
                },
                outerColor: {
                    ...parseRgb(theme.radialOuter.rgb),
                    alpha: theme.radialOuter.alpha,
                },
                edgeAlpha: theme.radialOuter.alpha * 0.42,
                radiusPx: baseRadius,
            }),
        [baseRadius, theme],
    );

    const glowStyle = useAnimatedStyle(() => {
        const multiplier =
            modeIndex.value < 0.5
                ? 0
                : modeMultiplier(modeIndex.value, pulse.value, {
                      offMultiplier: 0,
                      announceMinMultiplier: 0.85,
                      announceMaxMultiplier: 1.15,
                      inUseMultiplier: 1.25,
                  });
        return { opacity: multiplier / GLOW_MODE_MAX };
    }, [modeIndex, pulse]);

    const glowColor = theme.outerGlow;
    const glowPeakAlpha = Math.min(
        1,
        glowColor.alpha * MAIN_ORB_GLOW_OPACITY * GLOW_MODE_MAX,
    );

    return (
        <>
            <Animated.View style={[StyleSheet.absoluteFillObject, glowStyle]}>
                <Svg
                    width={box}
                    height={box}
                    style={StyleSheet.absoluteFillObject}
                >
                    <Defs>
                        <RadialGradient
                            id={`${idPrefix}-glow`}
                            cx="50%"
                            cy="50%"
                            r="50%"
                        >
                            {glowStops.positions.map((position, index) => (
                                <Stop
                                    key={index}
                                    offset={position}
                                    stopColor={glowColor.rgb}
                                    stopOpacity={
                                        glowStops.alphaMultipliers[index] *
                                        glowPeakAlpha
                                    }
                                />
                            ))}
                        </RadialGradient>
                    </Defs>
                    <Circle
                        cx={center}
                        cy={center}
                        r={glowStops.outerRadius}
                        fill={`url(#${idPrefix}-glow)`}
                    />
                </Svg>
            </Animated.View>
            <Svg width={box} height={box} style={StyleSheet.absoluteFillObject}>
                <Defs>
                    {/* Gradient units are the painted circle's bounding box,
                        so 50% always fills the circle exactly. */}
                    <RadialGradient
                        id={`${idPrefix}-body`}
                        cx="50%"
                        cy="50%"
                        r="50%"
                    >
                        {bodyProfile.stops.map((stop, index) => (
                            <Stop
                                key={index}
                                offset={stop.offset}
                                stopColor={stop.color}
                                stopOpacity={stop.alpha * ORB_BODY_ALPHA_SCALE}
                            />
                        ))}
                    </RadialGradient>
                    <RadialGradient
                        id={`${idPrefix}-shadow`}
                        // Skia centered the shadow gradient 0.13r up-left
                        // with radius 1.25r; units are the painted body
                        // circle's bbox (2r), so 0.13r = 6.5%.
                        cx="43.5%"
                        cy="43.5%"
                        r="62.5%"
                    >
                        <Stop
                            offset={0.66}
                            stopColor={theme.innerShadowBR.rgb}
                            stopOpacity={0}
                        />
                        <Stop
                            offset={1}
                            stopColor={theme.innerShadowBR.rgb}
                            stopOpacity={
                                theme.innerShadowBR.alpha *
                                ORB_SHADOW_ALPHA_SCALE
                            }
                        />
                    </RadialGradient>
                </Defs>
                <Circle
                    cx={center}
                    cy={center}
                    r={bodyRadius * bodyProfile.outerRadiusRatio}
                    fill={`url(#${idPrefix}-body)`}
                />
                <Circle
                    cx={center}
                    cy={center}
                    r={bodyRadius}
                    fill={`url(#${idPrefix}-shadow)`}
                />
            </Svg>
        </>
    );
}

function NativeProvisioningMarker({
    marker,
    centerX,
    centerY,
    radius,
    reducedMotion,
    frozenProgress,
    onExited,
}: {
    marker: RenderedProvisioningMarker;
    centerX: SharedValue<number>;
    centerY: SharedValue<number>;
    radius: SharedValue<number>;
    reducedMotion: boolean;
    frozenProgress?: number;
    onExited: (id: string) => void;
}) {
    const orbit = useSharedValue(0);
    const opacity = useSharedValue(0);
    const scale = useSharedValue(0.55);
    const frozen = frozenProgress != null;
    const phaseOffset = React.useMemo(
        () => seededTopRightPhase(marker.id),
        [marker.id],
    );
    const gradientStops = React.useMemo(
        () => PROVISIONING_MARKER_GLOW_COLORS.map(parseRgba),
        [],
    );

    React.useEffect(() => {
        if (frozen) {
            cancelAnimation(opacity);
            cancelAnimation(scale);
            opacity.value = marker.active ? 1 : 0;
            scale.value = marker.active ? 1 : 0.55;
            if (!marker.active) {
                onExited(marker.id);
            }
            return;
        }
        opacity.value = withTiming(marker.active ? 1 : 0, {
            duration: marker.active ? 280 : 220,
        });
        scale.value = withTiming(marker.active ? 1 : 0.55, {
            duration: marker.active ? 280 : 220,
        });
        if (marker.active) {
            return;
        }
        const exitTimer = setTimeout(() => {
            onExited(marker.id);
        }, 240);
        return () => {
            clearTimeout(exitTimer);
        };
    }, [frozen, marker.active, marker.id, onExited, opacity, scale]);

    React.useEffect(() => {
        cancelAnimation(orbit);
        if (frozen) {
            orbit.value = clampVisualProgress(frozenProgress ?? 0);
            return;
        }
        if (reducedMotion) {
            orbit.value = 0;
        } else {
            orbit.value = 0;
            orbit.value = withRepeat(
                withTiming(1, {
                    duration: PROVISIONING_MARKER_ORBIT_DURATION_MS,
                    easing: Easing.linear,
                }),
                -1,
                false,
            );
        }
        return () => {
            cancelAnimation(orbit);
        };
    }, [frozen, frozenProgress, orbit, reducedMotion]);

    // Glow sized like the Skia marker: clamp(0.18r, 11..24) * scale.
    const BOX = 48;
    const markerStyle = useAnimatedStyle(() => {
        const phase = reducedMotion ? 0.875 : (orbit.value + phaseOffset) % 1;
        const angle = phase * Math.PI * 2;
        const orbitRadius = radius.value * 1.08;
        const glowRadius =
            Math.max(11, Math.min(24, radius.value * 0.18)) * scale.value;
        return {
            opacity: opacity.value,
            transform: [
                {
                    translateX: centerX.value + Math.cos(angle) * orbitRadius,
                },
                {
                    translateY: centerY.value + Math.sin(angle) * orbitRadius,
                },
                { scale: glowRadius / (BOX / 2) },
            ],
        };
    }, [centerX, centerY, opacity, orbit, phaseOffset, radius, scale]);

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                {
                    position: "absolute",
                    left: -BOX / 2,
                    top: -BOX / 2,
                    width: BOX,
                    height: BOX,
                },
                markerStyle,
            ]}
        >
            <Svg width={BOX} height={BOX}>
                <Defs>
                    <RadialGradient
                        id={`marker-${marker.id}`}
                        cx="50%"
                        cy="50%"
                        r="50%"
                    >
                        {gradientStops.map((stop, index) => (
                            <Stop
                                key={index}
                                offset={
                                    PROVISIONING_MARKER_GLOW_POSITIONS[index]
                                }
                                stopColor={stop.color}
                                stopOpacity={stop.opacity}
                            />
                        ))}
                    </RadialGradient>
                </Defs>
                <Circle
                    cx={BOX / 2}
                    cy={BOX / 2}
                    r={BOX / 2}
                    fill={`url(#marker-${marker.id})`}
                />
            </Svg>
        </Animated.View>
    );
}

/**
 * The native (non-Skia) OrbScene renderer: plan phases 8-9. Shares the
 * scene contract (themes, layouts, motion plans, seeds, gesture overlays)
 * with OrbScene's Skia path and renders through Views, SVG gradients,
 * Reanimated transforms, and the pre-baked metaball masks.
 */
export function OrbSceneNative(props: OrbSceneProps) {
    const {
        width,
        height,
        orbRadiusScale = 1,
        maxVisibleOrbs = 3,
        evolutionLevel,
        themeLevel,
        headerTitle,
        pressHint,
        onPress,
        onHostedOrbPress,
        onLongPress,
        pressDisabled = false,
        applyBlur = false,
        accessibilityLabel,
        testID,
        activityLanes,
        provisioningMarkers,
        orbModes,
        localOrbIndex,
        highlightedOrbIndex,
        statusTopRatio = 0.68,
        orbSlotMap,
        visualTest,
    } = props;
    const { t } = useTranslation();
    const appIsActive = useAppIsActive();
    const systemReducedMotion =
        useReducedMotionPreference() || (isE2E() && !isPerf());
    const frozen = visualTest?.frozen === true;
    const frozenProgress = clampVisualProgress(visualTest?.progress ?? 0);
    const reducedMotion = visualTest
        ? (visualTest.reducedMotion ?? false)
        : systemReducedMotion;
    const frozenLightElapsedMs = frozen
        ? visualTestLightElapsedMs(frozenProgress)
        : undefined;
    const targetThemeLevel = themeLevel ?? evolutionLevel;
    const sceneTheme = SCENE_THEMES[targetThemeLevel];
    const sceneScale = Math.min(width, height);
    const resolvedOrbRadiusScale = Number.isFinite(orbRadiusScale)
        ? Math.max(0, orbRadiusScale)
        : 1;
    const resolvedMaxVisibleOrbs = Number.isFinite(maxVisibleOrbs)
        ? Math.max(1, Math.floor(maxVisibleOrbs))
        : 3;
    const lightSpawnXRangeScale =
        resolvedOrbRadiusScale >= 1
            ? 1
            : Math.max(0.4, resolvedOrbRadiusScale ** 1.6);

    const colorLfo = useSharedValue(0);
    const sceneLightElapsedMs = useSharedValue(0);
    const sceneLightFrameCallback = useFrameCallback((frameInfo) => {
        if (frameInfo.timeSincePreviousFrame != null) {
            sceneLightElapsedMs.value += frameInfo.timeSincePreviousFrame;
        }
    }, false);
    const orbRadius0 = useSharedValue(0);
    const orbRadius1 = useSharedValue(0);
    const orbRadius2 = useSharedValue(0);
    const orbCx0 = useSharedValue(0);
    const orbCy0 = useSharedValue(0);
    const orbCx1 = useSharedValue(0);
    const orbCy1 = useSharedValue(0);
    const orbCx2 = useSharedValue(0);
    const orbCy2 = useSharedValue(0);
    const orbCxValues = React.useMemo(
        () => [orbCx0, orbCx1, orbCx2],
        [orbCx0, orbCx1, orbCx2],
    );
    const orbCyValues = React.useMemo(
        () => [orbCy0, orbCy1, orbCy2],
        [orbCy0, orbCy1, orbCy2],
    );
    const orbRadiusValues = React.useMemo(
        () => [orbRadius0, orbRadius1, orbRadius2],
        [orbRadius0, orbRadius1, orbRadius2],
    );
    const swapT = useSharedValue(0);
    const swapInfo = useSharedValue({
        a: -1,
        b: -1,
        fromAx: 0,
        fromAy: 0,
        fromBx: 0,
        fromBy: 0,
        toAx: 0,
        toAy: 0,
        toBx: 0,
        toBy: 0,
        px: 0,
        py: 0,
        fromRadA: 0,
        fromRadB: 0,
        toRadA: 0,
        toRadB: 0,
    });
    const orbColorIndex0 = useSharedValue(0);
    const orbColorIndex1 = useSharedValue(0);
    const orbColorIndex2 = useSharedValue(0);
    const orbColorIndexValues = React.useMemo(
        () => [orbColorIndex0, orbColorIndex1, orbColorIndex2],
        [orbColorIndex0, orbColorIndex1, orbColorIndex2],
    );
    const previousModesRef = React.useRef<OrbVisualMode[]>([
        "off",
        "off",
        "off",
    ]);
    const [renderedProvisioningMarkers, setRenderedProvisioningMarkers] =
        React.useState<RenderedProvisioningMarker[]>(() =>
            normalizeProvisioningMarkers(provisioningMarkers).map((marker) => ({
                ...marker,
                active: true,
            })),
        );

    React.useEffect(() => {
        if (frozen) {
            sceneLightFrameCallback.setActive(false);
            sceneLightElapsedMs.value =
                visualTestLightElapsedMs(frozenProgress);
            return;
        }
        sceneLightFrameCallback.setActive(appIsActive && !reducedMotion);
        return () => sceneLightFrameCallback.setActive(false);
    }, [
        appIsActive,
        frozen,
        frozenProgress,
        reducedMotion,
        sceneLightElapsedMs,
        sceneLightFrameCallback,
    ]);

    React.useEffect(() => {
        const nextMarkers = normalizeProvisioningMarkers(provisioningMarkers);
        setRenderedProvisioningMarkers((previousMarkers) => {
            const nextById = new Map(
                nextMarkers.map((marker) => [marker.id, marker]),
            );
            const merged: RenderedProvisioningMarker[] = [];
            for (const marker of nextMarkers) {
                merged.push({ ...marker, active: true });
            }
            for (const marker of previousMarkers) {
                if (!nextById.has(marker.id)) {
                    merged.push({ ...marker, active: false });
                }
            }
            return merged;
        });
    }, [provisioningMarkers]);

    const handleProvisioningMarkerExited = React.useCallback((id: string) => {
        setRenderedProvisioningMarkers((markers) =>
            markers.filter((marker) => marker.id !== id || marker.active),
        );
    }, []);

    const hasAnnouncingMode =
        (orbModes?.[0] ?? "off") === "announcing" ||
        (orbModes?.[1] ?? "off") === "announcing" ||
        (orbModes?.[2] ?? "off") === "announcing";

    React.useEffect(() => {
        cancelAnimation(colorLfo);
        if (frozen) {
            colorLfo.value = frozenProgress;
            return;
        }
        colorLfo.value = 0;
        if (hasAnnouncingMode) {
            colorLfo.value = withRepeat(
                withTiming(1, { duration: 4200 }),
                -1,
                true,
            );
        }
        return () => cancelAnimation(colorLfo);
    }, [colorLfo, frozen, frozenProgress, hasAnnouncingMode]);

    React.useEffect(() => {
        const modes = [
            orbModes?.[0] ?? "off",
            orbModes?.[1] ?? "off",
            orbModes?.[2] ?? "off",
        ] as OrbVisualMode[];
        const previousModes = previousModesRef.current;
        orbColorIndexValues.forEach((indexValue, orbIndex) => {
            const mode = modes[orbIndex];
            const target = mode === "off" ? 0 : mode === "announcing" ? 1 : 2;
            if (frozen) {
                cancelAnimation(indexValue);
                indexValue.value = target;
                return;
            }
            const prevMode = previousModes[orbIndex];
            if (mode === prevMode) {
                return;
            }
            cancelAnimation(indexValue);
            indexValue.value = withTiming(target, {
                duration: mode === "in_use" ? 1300 : 500,
            });
        });
        previousModesRef.current = modes;
    }, [frozen, orbColorIndexValues, orbModes]);

    const orbLayout = React.useMemo(
        () => ORB_LAYOUTS[evolutionLevel].slice(0, resolvedMaxVisibleOrbs),
        [evolutionLevel, resolvedMaxVisibleOrbs],
    );
    const orbGeometries = React.useMemo(
        () =>
            orbLayout.map((orb, index) => ({
                index,
                cx: width * orb.cxRatio,
                cy: height * orb.cyRatio,
                baseRadius:
                    sceneScale * orb.radiusRatio * resolvedOrbRadiusScale,
                radius: orbRadiusValues[index],
            })),
        [
            height,
            orbLayout,
            orbRadiusValues,
            resolvedOrbRadiusScale,
            sceneScale,
            width,
        ],
    );

    // Per-frame arc computation driven by swapT (0->1), identical to the
    // Skia renderer.
    useAnimatedReaction(
        () => swapT.value,
        (tValue) => {
            "worklet";
            const s = swapInfo.value;
            if (s.a < 0 || s.b < 0) return;
            if (tValue <= 0) return;

            const sinArc = Math.sin(Math.PI * Math.min(tValue, 1));
            const ax = s.fromAx + (s.toAx - s.fromAx) * tValue + s.px * sinArc;
            const ay = s.fromAy + (s.toAy - s.fromAy) * tValue + s.py * sinArc;
            const bx = s.fromBx + (s.toBx - s.fromBx) * tValue - s.px * sinArc;
            const by = s.fromBy + (s.toBy - s.fromBy) * tValue - s.py * sinArc;
            const rA =
                s.fromRadA + (s.toRadA - s.fromRadA) * Math.min(tValue, 1);
            const rB =
                s.fromRadB + (s.toRadB - s.fromRadB) * Math.min(tValue, 1);

            if (s.a === 0) {
                orbCx0.value = ax;
                orbCy0.value = ay;
                orbRadius0.value = rA;
            } else if (s.a === 1) {
                orbCx1.value = ax;
                orbCy1.value = ay;
                orbRadius1.value = rA;
            } else {
                orbCx2.value = ax;
                orbCy2.value = ay;
                orbRadius2.value = rA;
            }
            if (s.b === 0) {
                orbCx0.value = bx;
                orbCy0.value = by;
                orbRadius0.value = rB;
            } else if (s.b === 1) {
                orbCx1.value = bx;
                orbCy1.value = by;
                orbRadius1.value = rB;
            } else {
                orbCx2.value = bx;
                orbCy2.value = by;
                orbRadius2.value = rB;
            }
        },
        [swapT, swapInfo],
    );

    const orbSlotMapKey = (orbSlotMap ?? DEFAULT_ORB_SLOT_MAP).join(",");
    const effectiveSlotMap = React.useMemo(
        () => [...(orbSlotMap ?? DEFAULT_ORB_SLOT_MAP)],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [orbSlotMapKey],
    );
    const orbEffectiveBaseRadius = React.useMemo(
        () =>
            orbGeometries.map((orb, index) => {
                const slot = effectiveSlotMap[index] ?? index;
                return orbGeometries[slot]?.baseRadius ?? orb.baseRadius;
            }),
        [effectiveSlotMap, orbGeometries],
    );

    const previousSlotMapRef = React.useRef<number[]>([0, 1, 2]);
    const hasInitializedOrbLayoutRef = React.useRef(false);
    const orb0BaseRadius = orbGeometries[0]?.baseRadius ?? 0;
    const orb1BaseRadius = orbGeometries[1]?.baseRadius ?? 0;
    const orb2BaseRadius = orbGeometries[2]?.baseRadius ?? 0;

    React.useLayoutEffect(() => {
        const prevMap = previousSlotMapRef.current;
        const allCx = [orbCx0, orbCx1, orbCx2];
        const allCy = [orbCy0, orbCy1, orbCy2];
        const allRadius = [orbRadius0, orbRadius1, orbRadius2];

        // First paint should already be in the final scene layout. The former
        // Skia entrance initialized every orb at x=0/r=0 and animated it into
        // place, which read as the whole scene popping in from the left.
        if (!frozen && !hasInitializedOrbLayoutRef.current) {
            for (let i = 0; i < orbGeometries.length; i++) {
                const targetSlot = effectiveSlotMap[i] ?? i;
                cancelAnimation(allCx[i]);
                cancelAnimation(allCy[i]);
                cancelAnimation(allRadius[i]);
                allCx[i].value = orbGeometries[targetSlot]?.cx ?? 0;
                allCy[i].value = orbGeometries[targetSlot]?.cy ?? 0;
                allRadius[i].value = orbGeometries[targetSlot]?.baseRadius ?? 0;
            }
            previousSlotMapRef.current = [...effectiveSlotMap];
            hasInitializedOrbLayoutRef.current = true;
            return;
        }

        const swapPairs: [number, number][] = [];
        const visited = new Set<number>();
        for (let i = 0; i < orbGeometries.length; i++) {
            if (visited.has(i)) continue;
            const prevSlot = prevMap[i] ?? i;
            const nextSlot = effectiveSlotMap[i] ?? i;
            if (prevSlot !== nextSlot) {
                for (let j = i + 1; j < orbGeometries.length; j++) {
                    const prevSlotJ = prevMap[j] ?? j;
                    const nextSlotJ = effectiveSlotMap[j] ?? j;
                    if (
                        prevSlotJ !== nextSlotJ &&
                        nextSlot === prevSlotJ &&
                        nextSlotJ === prevSlot
                    ) {
                        swapPairs.push([i, j]);
                        visited.add(i);
                        visited.add(j);
                        break;
                    }
                }
            }
        }

        if (frozen) {
            const tValue = frozenProgress;
            const sinArc = Math.sin(Math.PI * tValue);
            for (const [a, b] of swapPairs) {
                const fromSlotA = prevMap[a] ?? a;
                const toSlotA = effectiveSlotMap[a] ?? a;
                const fromSlotB = prevMap[b] ?? b;
                const toSlotB = effectiveSlotMap[b] ?? b;
                const fromAx = orbGeometries[fromSlotA]?.cx ?? 0;
                const fromAy = orbGeometries[fromSlotA]?.cy ?? 0;
                const fromBx = orbGeometries[fromSlotB]?.cx ?? 0;
                const fromBy = orbGeometries[fromSlotB]?.cy ?? 0;
                const toAx = orbGeometries[toSlotA]?.cx ?? 0;
                const toAy = orbGeometries[toSlotA]?.cy ?? 0;
                const toBx = orbGeometries[toSlotB]?.cx ?? 0;
                const toBy = orbGeometries[toSlotB]?.cy ?? 0;
                const dx = toAx - fromAx;
                const dy = toAy - fromAy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const arcMag = dist * 0.4;
                const px = dist > 0 ? (-dy / dist) * arcMag : 0;
                const py = dist > 0 ? (dx / dist) * arcMag : 0;
                const fromRadA = orbGeometries[fromSlotA]?.baseRadius ?? 0;
                const fromRadB = orbGeometries[fromSlotB]?.baseRadius ?? 0;
                const toRadA = orbGeometries[toSlotA]?.baseRadius ?? 0;
                const toRadB = orbGeometries[toSlotB]?.baseRadius ?? 0;

                cancelAnimation(allCx[a]);
                cancelAnimation(allCy[a]);
                cancelAnimation(allRadius[a]);
                cancelAnimation(allCx[b]);
                cancelAnimation(allCy[b]);
                cancelAnimation(allRadius[b]);
                allCx[a].value =
                    fromAx + (toAx - fromAx) * tValue + px * sinArc;
                allCy[a].value =
                    fromAy + (toAy - fromAy) * tValue + py * sinArc;
                allCx[b].value =
                    fromBx + (toBx - fromBx) * tValue - px * sinArc;
                allCy[b].value =
                    fromBy + (toBy - fromBy) * tValue - py * sinArc;
                allRadius[a].value = fromRadA + (toRadA - fromRadA) * tValue;
                allRadius[b].value = fromRadB + (toRadB - fromRadB) * tValue;
            }
            for (let i = 0; i < orbGeometries.length; i++) {
                if (visited.has(i)) continue;
                const targetSlot = effectiveSlotMap[i] ?? i;
                cancelAnimation(allCx[i]);
                cancelAnimation(allCy[i]);
                cancelAnimation(allRadius[i]);
                allCx[i].value = orbGeometries[targetSlot]?.cx ?? 0;
                allCy[i].value = orbGeometries[targetSlot]?.cy ?? 0;
                allRadius[i].value = orbGeometries[targetSlot]?.baseRadius ?? 0;
            }
            // Leave previousSlotMapRef untouched so scrubbing re-detects
            // the same swap on every run.
            return;
        }

        for (const [a, b] of swapPairs) {
            const fromAx = allCx[a].value;
            const fromAy = allCy[a].value;
            const fromBx = allCx[b].value;
            const fromBy = allCy[b].value;
            const targetSlotA = effectiveSlotMap[a] ?? a;
            const targetSlotB = effectiveSlotMap[b] ?? b;
            const toAx = orbGeometries[targetSlotA]?.cx ?? 0;
            const toAy = orbGeometries[targetSlotA]?.cy ?? 0;
            const toBx = orbGeometries[targetSlotB]?.cx ?? 0;
            const toBy = orbGeometries[targetSlotB]?.cy ?? 0;
            const dx = toAx - fromAx;
            const dy = toAy - fromAy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const arcMag = dist * 0.4;
            const px = dist > 0 ? (-dy / dist) * arcMag : 0;
            const py = dist > 0 ? (dx / dist) * arcMag : 0;
            const targetRadiusA = orbGeometries[targetSlotA]?.baseRadius ?? 0;
            const targetRadiusB = orbGeometries[targetSlotB]?.baseRadius ?? 0;

            swapInfo.value = {
                a,
                b,
                fromAx,
                fromAy,
                fromBx,
                fromBy,
                toAx,
                toAy,
                toBx,
                toBy,
                px,
                py,
                fromRadA: allRadius[a].value,
                fromRadB: allRadius[b].value,
                toRadA: targetRadiusA,
                toRadB: targetRadiusB,
            };
            cancelAnimation(swapT);
            swapT.value = 0;
            swapT.value = withTiming(1, {
                duration: 800,
                easing: Easing.inOut(Easing.cubic),
            });
        }

        for (let i = 0; i < orbGeometries.length; i++) {
            if (visited.has(i)) continue;
            const targetSlot = effectiveSlotMap[i] ?? i;
            const targetCx = orbGeometries[targetSlot]?.cx ?? 0;
            const targetCy = orbGeometries[targetSlot]?.cy ?? 0;
            const targetRadius = orbGeometries[targetSlot]?.baseRadius ?? 0;
            const prevCx = allCx[i].value;
            const prevCy = allCy[i].value;
            const posDelta = Math.sqrt(
                (targetCx - prevCx) ** 2 + (targetCy - prevCy) ** 2,
            );

            if (posDelta > 5) {
                allCx[i].value = withTiming(targetCx, { duration: 500 });
                allCy[i].value = withTiming(targetCy, { duration: 500 });
            } else {
                allCx[i].value = targetCx;
                allCy[i].value = targetCy;
            }

            const radiusDelta = Math.abs(targetRadius - allRadius[i].value);
            if (targetRadius <= 0) {
                allRadius[i].value = withTiming(0, { duration: 160 });
            } else if (radiusDelta > 0.5) {
                allRadius[i].value = withDelay(
                    i * 90,
                    withSpring(targetRadius, {
                        mass: 1.15,
                        damping: 10,
                        stiffness: 100,
                        restDisplacementThreshold: 0.01,
                        restSpeedThreshold: 2,
                    }),
                );
            } else {
                allRadius[i].value = targetRadius;
            }
        }

        previousSlotMapRef.current = [...effectiveSlotMap];
    }, [
        frozen,
        frozenProgress,
        orb0BaseRadius,
        orb1BaseRadius,
        orb2BaseRadius,
        orbRadius0,
        orbRadius1,
        orbRadius2,
        orbCx0,
        orbCy0,
        orbCx1,
        orbCy1,
        orbCx2,
        orbCy2,
        effectiveSlotMap,
        orbGeometries,
        swapInfo,
        swapT,
    ]);

    const activityLaneKey = JSON.stringify(
        (activityLanes ?? []).map((lane) => [
            lane.id,
            lane.orbIndex,
            lane.connectedCount,
        ]),
    );
    const activeLanes = React.useMemo(
        () =>
            (activityLanes ?? []).filter((lane) => {
                if (
                    lane.orbIndex < 0 ||
                    lane.orbIndex >= orbGeometries.length
                ) {
                    return false;
                }
                return clampLights(lane.connectedCount) > 0;
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [activityLaneKey, orbGeometries.length],
    );
    const laneLightSpecs = React.useMemo(() => {
        let motionIndex = 0;
        return activeLanes.map((lane) => {
            const effectiveRadius =
                orbEffectiveBaseRadius[lane.orbIndex] ??
                orbGeometries[lane.orbIndex]?.baseRadius ??
                0;
            const orbSizeRatio =
                effectiveRadius /
                Math.max(sceneScale * resolvedOrbRadiusScale, 1);
            const verticalBias =
                lane.id !== "local"
                    ? Math.max(0, Math.min(1, (0.12 - orbSizeRatio) / 0.05))
                    : 0;
            const exitDistance =
                lane.id === "local"
                    ? effectiveRadius * 2
                    : effectiveRadius * 1.8;
            const secondLastPoint = { x: 0, y: -exitDistance * 0.5 };
            const endPoint = { x: 0, y: -exitDistance };
            const lights = Array.from(
                { length: clampLights(lane.connectedCount) },
                (_, index) => {
                    const seed = connectionLightSeed(`${lane.id}-${index}`);
                    return {
                        index,
                        motionIndex: motionIndex++,
                        seed,
                        motionPlan: createConnectionLightMotionPlan(
                            seed,
                            effectiveRadius,
                            lightSpawnXRangeScale,
                            verticalBias,
                        ),
                        orbRadius: effectiveRadius,
                        midPoint: CONNECTION_LIGHT_MID_POINT,
                        secondLastPoint,
                        endPoint,
                    };
                },
            );
            return {
                id: lane.id,
                orbIndex: lane.orbIndex,
                effectiveRadius,
                secondLastPoint,
                endPoint,
                lights,
            };
        });
    }, [
        activeLanes,
        lightSpawnXRangeScale,
        orbEffectiveBaseRadius,
        orbGeometries,
        resolvedOrbRadiusScale,
        sceneScale,
    ]);
    const sceneLightSpecs = React.useMemo<ConnectionLightMotionSpec[]>(
        () => laneLightSpecs.flatMap((lane) => lane.lights),
        [laneLightSpecs],
    );
    const sceneLightMotionBuffer = useDerivedValue(
        () =>
            evaluateConnectionLightMotionBuffer(
                sceneLightSpecs,
                sceneLightElapsedMs.value,
            ),
        [sceneLightElapsedMs, sceneLightSpecs],
    );

    const visibleProvisioningMarkers = renderedProvisioningMarkers.filter(
        (marker) =>
            marker.orbIndex >= 0 && marker.orbIndex < orbGeometries.length,
    );
    const activeProvisioningOrbIndexes = new Set(
        visibleProvisioningMarkers
            .filter((marker) => marker.active)
            .map((marker) => marker.orbIndex),
    );

    // Scene-blur approximation (plan phase 8): dim and slightly flatten
    // instead of a live blur dependency.
    const sceneOpacity = applyBlur ? 0.78 : 1;

    return (
        <View style={{ width, height, backgroundColor: "transparent" }}>
            <Animated.View
                pointerEvents="none"
                style={[ss.absoluteFill, { opacity: sceneOpacity }]}
            >
                {/* Lights sit BEHIND the orb bodies. The bodies are
                    translucent (roughly 20-25% alpha at the centre rising to
                    ~65% at the rim), so a light crossing the rim dims and
                    tints through the shell instead of vanishing — reading as
                    absorption. Skia achieved this differently: it drew a
                    second hidden proxy circle per light inside the
                    blur+threshold layer so the alpha fields merged. There is
                    no shared alpha field here, so layering under the shell is
                    the approximation. */}
                {laneLightSpecs.map((lane) => (
                    <LaneAnchor
                        key={`lights-${lane.id}`}
                        centerX={orbCxValues[lane.orbIndex]}
                        centerY={orbCyValues[lane.orbIndex]}
                    >
                        {lane.lights.map((light) => (
                            <NativeConnectionLight
                                key={`light-${lane.id}-${light.index}`}
                                active={true}
                                orbRadius={lane.effectiveRadius}
                                midPoint={CONNECTION_LIGHT_MID_POINT}
                                secondLastPoint={lane.secondLastPoint}
                                endPoint={lane.endPoint}
                                randomize={true}
                                sharedMotionBuffer={sceneLightMotionBuffer}
                                sharedMotionIndex={light.motionIndex}
                                visualFrozenElapsedMs={frozenLightElapsedMs}
                            />
                        ))}
                    </LaneAnchor>
                ))}

                {orbGeometries.map((orb, index) => {
                    const usesLocalTheme =
                        localOrbIndex === index ||
                        (index === 0 && evolutionLevel === 0) ||
                        (index === 0 && localOrbIndex == null);
                    return (
                        <NativeOrbBody
                            key={`orb-${index}`}
                            index={index}
                            baseRadius={orb.baseRadius}
                            maxBaseRadius={Math.max(
                                ...orbGeometries.map(
                                    (candidate) => candidate.baseRadius,
                                ),
                            )}
                            centerX={orbCxValues[index]}
                            centerY={orbCyValues[index]}
                            radius={orbRadiusValues[index]}
                            theme={
                                usesLocalTheme
                                    ? sceneTheme.orb
                                    : SCENE_THEMES[HOSTED_ORB_THEME_LEVEL].orb
                            }
                            themeKey={
                                usesLocalTheme
                                    ? `local-${targetThemeLevel}`
                                    : "hosted"
                            }
                            modeIndex={orbColorIndexValues[index]}
                            pulse={colorLfo}
                        />
                    );
                })}

                {visibleProvisioningMarkers.map((marker) => (
                    <NativeProvisioningMarker
                        key={`provisioning-marker-${marker.id}`}
                        marker={marker}
                        centerX={orbCxValues[marker.orbIndex]}
                        centerY={orbCyValues[marker.orbIndex]}
                        radius={orbRadiusValues[marker.orbIndex]}
                        reducedMotion={reducedMotion}
                        frozenProgress={frozen ? frozenProgress : undefined}
                        onExited={handleProvisioningMarkerExited}
                    />
                ))}
            </Animated.View>

            {orbGeometries.map((orb) => {
                const isLocalOrb =
                    localOrbIndex != null && orb.index === localOrbIndex;
                const isPrimaryOffOrb = evolutionLevel === 0 && orb.index === 0;
                const isPrimaryTestOrb =
                    isLocalOrb ||
                    isPrimaryOffOrb ||
                    (localOrbIndex == null && orb.index === 0);
                const tapAction =
                    isLocalOrb || isPrimaryOffOrb
                        ? onPress
                        : onHostedOrbPress
                          ? () => {
                                onHostedOrbPress({
                                    orbIndex: orb.index,
                                    centerX: orbCxValues[orb.index].value,
                                    centerY: orbCyValues[orb.index].value,
                                    radius: orb.baseRadius,
                                });
                            }
                          : undefined;
                const longPressAction = isLocalOrb ? onLongPress : undefined;
                const isHostedProvisioningOrb =
                    !isLocalOrb &&
                    !isPrimaryOffOrb &&
                    activeProvisioningOrbIndexes.has(orb.index);
                const orbLabel = isLocalOrb
                    ? t("LOCAL_CONDUIT_ORB_ACCESSIBILITY_I18N.string")
                    : isPrimaryOffOrb
                      ? t("CONDUIT_ORB_ACCESSIBILITY_I18N.string")
                      : isHostedProvisioningOrb
                        ? t(
                              "HOSTED_CONDUIT_PROVISIONING_ORB_ACCESSIBILITY_I18N.string",
                          )
                        : t("HOSTED_CONDUIT_ORB_TAP_ACCESSIBILITY_I18N.string");

                return (
                    <OrbGestureOverlay
                        key={`orb-touch-${orb.index}`}
                        centerX={orbCxValues[orb.index]}
                        centerY={orbCyValues[orb.index]}
                        radius={orb.radius}
                        baseRadius={
                            orbEffectiveBaseRadius[orb.index] ?? orb.baseRadius
                        }
                        enabled={!pressDisabled}
                        highlighted={highlightedOrbIndex === orb.index}
                        accessibilityLabel={
                            accessibilityLabel
                                ? `${accessibilityLabel} - ${orbLabel}`
                                : orbLabel
                        }
                        testID={isPrimaryTestOrb ? testID : undefined}
                        onTapAction={tapAction}
                        onLongPressAction={longPressAction}
                    />
                );
            })}

            {headerTitle ? (
                <View
                    pointerEvents="none"
                    style={{
                        position: "absolute",
                        top: Math.max(16, height * 0.065),
                        width: "100%",
                        alignItems: "center",
                        gap: 2,
                    }}
                >
                    <Text
                        style={[
                            ss.bodyFont,
                            {
                                color: sceneTheme.titleColor,
                                fontSize: Math.max(
                                    20,
                                    Math.min(38, width * 0.09),
                                ),
                                letterSpacing: 1,
                            },
                        ]}
                    >
                        {headerTitle}
                    </Text>
                </View>
            ) : null}

            {pressHint ? (
                <View
                    pointerEvents="none"
                    style={{
                        position: "absolute",
                        top: height * statusTopRatio,
                        width: "100%",
                        alignItems: "center",
                        paddingHorizontal: 16,
                    }}
                >
                    <Text
                        style={[
                            ss.tinyFont,
                            {
                                color: sceneTheme.hintColor,
                                fontSize: Math.max(
                                    12,
                                    Math.min(22, width * 0.034),
                                ),
                                letterSpacing: 0.5,
                                textAlign: "center",
                            },
                        ]}
                    >
                        {pressHint}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

/** Zero-size anchor tracking an orb center for lights/tails. */
function LaneAnchor({
    centerX,
    centerY,
    children,
}: {
    centerX: SharedValue<number>;
    centerY: SharedValue<number>;
    children: React.ReactNode;
}) {
    const anchorStyle = useAnimatedStyle(
        () => ({
            transform: [
                { translateX: centerX.value },
                { translateY: centerY.value },
            ],
        }),
        [centerX, centerY],
    );
    return (
        <Animated.View
            pointerEvents="none"
            style={[{ position: "absolute", width: 0, height: 0 }, anchorStyle]}
        >
            {children}
        </Animated.View>
    );
}

/**
 * A single orb: theme layer sets in a wrapper that animates position and
 * scale from the scene's shared values. Only the active theme is mounted;
 * keeping all four translucent SVG theme stacks alive cost dozens of native
 * views and large raster surfaces during the steady-state animation.
 */
function NativeOrbBody({
    index,
    baseRadius,
    maxBaseRadius,
    centerX,
    centerY,
    radius,
    theme,
    themeKey,
    modeIndex,
    pulse,
}: {
    index: number;
    baseRadius: number;
    maxBaseRadius: number;
    centerX: SharedValue<number>;
    centerY: SharedValue<number>;
    radius: SharedValue<number>;
    theme: OrbTheme;
    themeKey: string;
    modeIndex: SharedValue<number>;
    pulse: SharedValue<number>;
}) {
    // Render at the largest slot radius so swap growth never upscales.
    const renderRadius = Math.max(baseRadius, maxBaseRadius);
    const glowStops = calculateOrbGlowGradientStops(
        renderRadius,
        renderRadius * MAIN_ORB_GLOW_SIGMA_RATIO,
    );
    const box = glowStops.outerRadius * 2;

    const wrapperStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { translateX: centerX.value - box / 2 },
                { translateY: centerY.value - box / 2 },
                { scale: Math.max(0.0001, radius.value / renderRadius) },
            ],
        };
    }, [box, centerX, centerY, radius, renderRadius]);

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                {
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: box,
                    height: box,
                },
                wrapperStyle,
            ]}
        >
            <OrbThemeLayers
                key={themeKey}
                idPrefix={`orb-${index}-${themeKey}`}
                baseRadius={renderRadius}
                theme={theme}
                modeIndex={modeIndex}
                pulse={pulse}
            />
        </Animated.View>
    );
}

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
    Blur,
    Canvas,
    Circle,
    ColorMatrix,
    Group,
    Paint,
    RadialGradient,
    rect,
    vec,
} from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    Easing,
    SharedValue,
    cancelAnimation,
    interpolateColor,
    runOnJS,
    useAnimatedReaction,
    useAnimatedStyle,
    useDerivedValue,
    useFrameCallback,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";

import { multiplyColorAlpha, rgbaFromRgb } from "@/src/common/colorUtils";
import { isE2E } from "@/src/common/e2e";
import { ConduitConnectionLight } from "@/src/components/canvas/ConduitConnectionLight";
import {
    ConnectionLightMotionSpec,
    connectionLightSeed,
    createConnectionLightMotionPlan,
    evaluateConnectionLightMotionBuffer,
} from "@/src/components/canvas/connectionLightMotion";
import {
    calculateOrbGlowGradientStops,
    calculateOrbMorphClipBounds,
} from "@/src/components/orb-scene/orbSceneMath";
import {
    clampLights,
    modeMultiplier,
} from "@/src/components/orb-scene/orbUtils";
import { useAppIsActive, useReducedMotionPreference } from "@/src/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

export type OrbEvolutionLevel = 0 | 1 | 2 | 3;
export type OrbVisualMode = "off" | "announcing" | "in_use";

export interface OrbSceneActivityLane {
    id: string;
    orbIndex: number;
    connectedCount: number;
    exitXRatio?: number;
    exitYRatio?: number;
}

export interface OrbSceneHostedOrbPressEvent {
    orbIndex: number;
    centerX: number;
    centerY: number;
    radius: number;
}

export interface OrbSceneProvisioningMarker {
    id: string;
    orbIndex: number;
}

export interface OrbSceneProps {
    width: number;
    height: number;
    orbRadiusScale?: number;
    maxVisibleOrbs?: number;
    evolutionLevel: OrbEvolutionLevel;
    themeLevel?: OrbEvolutionLevel;
    headerTitle?: string;
    pressHint?: string | null;
    onPress?: () => void;
    onHostedOrbPress?: (event: OrbSceneHostedOrbPressEvent) => void;
    onLongPress?: () => void;
    pressDisabled?: boolean;
    applyBlur?: boolean;
    accessibilityLabel?: string;
    testID?: string;
    activityLanes?: OrbSceneActivityLane[];
    provisioningMarkers?: OrbSceneProvisioningMarker[];
    orbModes?: OrbVisualMode[];
    localOrbIndex?: number | null;
    highlightedOrbIndex?: number | null;
    statusOpacity?: number;
    statusTopRatio?: number;
    orbSlotMap?: number[];
}

interface OrbGestureOverlayProps {
    centerX: SharedValue<number>;
    centerY: SharedValue<number>;
    radius: SharedValue<number>;
    baseRadius: number;
    enabled: boolean;
    highlighted?: boolean;
    accessibilityLabel?: string;
    testID?: string;
    onTapAction?: () => void;
    onLongPressAction?: () => void;
}

const THEME_LEVELS: OrbEvolutionLevel[] = [0, 1, 2, 3];
const HOSTED_ORB_THEME_LEVEL: OrbEvolutionLevel = 3;
const DEFAULT_ORB_SLOT_MAP = [0, 1, 2];
const MAIN_ORB_GLOW_SIGMA_RATIO = 0.2;
const MAIN_ORB_GLOW_OPACITY = 0.45;
const MORPH_BLUR_RADIUS = 5;
const MORPH_BLUR_SUPPORT = MORPH_BLUR_RADIUS * 3;
const MORPH_AA_PADDING = 2;
const CONNECTION_LIGHT_MID_POINT = vec(0, 0);

function clampNumber(value: number, min: number, max: number): number {
    "worklet";
    return Math.max(min, Math.min(max, value));
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

interface OrbAnimatedTheme {
    radialInner: SharedValue<string>;
    radialOuter: SharedValue<string>;
    innerShadowBR: SharedValue<string>;
    outerGlow: SharedValue<string>;
}

interface OrbGlowProps {
    center: SharedValue<{ x: number; y: number }>;
    centerX: SharedValue<number>;
    centerY: SharedValue<number>;
    radius: SharedValue<number>;
    color: SharedValue<string>;
}

const MAIN_ORB_GLOW_ALPHA_MULTIPLIERS = calculateOrbGlowGradientStops(
    0,
    1,
).alphaMultipliers;

function OrbGlow({ center, centerX, centerY, radius, color }: OrbGlowProps) {
    const gradientStops = useDerivedValue(
        () =>
            calculateOrbGlowGradientStops(
                radius.value,
                radius.value * MAIN_ORB_GLOW_SIGMA_RATIO,
            ),
        [radius],
    );
    const outerRadius = useDerivedValue(
        () => gradientStops.value.outerRadius,
        [gradientStops],
    );
    const positions = useDerivedValue(
        () => gradientStops.value.positions,
        [gradientStops],
    );
    const colors = useDerivedValue(
        () =>
            MAIN_ORB_GLOW_ALPHA_MULTIPLIERS.map((multiplier) =>
                multiplyColorAlpha(
                    color.value,
                    multiplier * MAIN_ORB_GLOW_OPACITY,
                ),
            ),
        [color],
    );

    return (
        <Circle cx={centerX} cy={centerY} r={outerRadius}>
            <RadialGradient
                c={center}
                r={outerRadius}
                colors={colors}
                positions={positions}
            />
        </Circle>
    );
}

function useInterpolatedOrbTheme(
    themeProgress: SharedValue<number>,
): OrbAnimatedTheme {
    const radialInnerStops = React.useMemo(
        () =>
            THEME_LEVELS.map((level) =>
                rgbaFromRgb(
                    SCENE_THEMES[level].orb.radialInner.rgb,
                    SCENE_THEMES[level].orb.radialInner.alpha,
                ),
            ),
        [],
    );
    const radialOuterStops = React.useMemo(
        () =>
            THEME_LEVELS.map((level) =>
                rgbaFromRgb(
                    SCENE_THEMES[level].orb.radialOuter.rgb,
                    SCENE_THEMES[level].orb.radialOuter.alpha,
                ),
            ),
        [],
    );
    const innerShadowBRStops = React.useMemo(
        () =>
            THEME_LEVELS.map((level) =>
                rgbaFromRgb(
                    SCENE_THEMES[level].orb.innerShadowBR.rgb,
                    SCENE_THEMES[level].orb.innerShadowBR.alpha,
                ),
            ),
        [],
    );
    const outerGlowStops = React.useMemo(
        () =>
            THEME_LEVELS.map((level) =>
                rgbaFromRgb(
                    SCENE_THEMES[level].orb.outerGlow.rgb,
                    SCENE_THEMES[level].orb.outerGlow.alpha,
                ),
            ),
        [],
    );

    const radialInner = useDerivedValue(() => {
        return interpolateColor(
            themeProgress.value,
            THEME_LEVELS,
            radialInnerStops,
        );
    }, [themeProgress, radialInnerStops]);

    const radialOuter = useDerivedValue(() => {
        return interpolateColor(
            themeProgress.value,
            THEME_LEVELS,
            radialOuterStops,
        );
    }, [themeProgress, radialOuterStops]);

    const innerShadowBR = useDerivedValue(() => {
        return interpolateColor(
            themeProgress.value,
            THEME_LEVELS,
            innerShadowBRStops,
        );
    }, [themeProgress, innerShadowBRStops]);

    const outerGlow = useDerivedValue(() => {
        return interpolateColor(
            themeProgress.value,
            THEME_LEVELS,
            outerGlowStops,
        );
    }, [themeProgress, outerGlowStops]);

    return { radialInner, radialOuter, innerShadowBR, outerGlow };
}

function useOrbPalette(
    modeIndex: SharedValue<number>,
    pulse: SharedValue<number>,
    orbTheme: OrbAnimatedTheme,
) {
    const edge = useDerivedValue(() => {
        return orbTheme.radialOuter.value;
    });

    const core = useDerivedValue(() => {
        return orbTheme.radialInner.value;
    });

    const innerShadowBR = useDerivedValue(() => {
        const multiplier = modeMultiplier(modeIndex.value, pulse.value, {
            offMultiplier: 0.92,
            announceMinMultiplier: 0.95,
            announceMaxMultiplier: 1,
            inUseMultiplier: 1,
        });
        return multiplyColorAlpha(orbTheme.innerShadowBR.value, multiplier);
    });

    const innerShadowGradient = useDerivedValue(() => {
        return [
            multiplyColorAlpha(innerShadowBR.value, 0),
            innerShadowBR.value,
        ];
    });

    const gradient = useDerivedValue(() => [core.value, edge.value]);

    const glow = useDerivedValue(() => {
        if (modeIndex.value < 0.5) {
            return multiplyColorAlpha(orbTheme.outerGlow.value, 0);
        }
        const multiplier = modeMultiplier(modeIndex.value, pulse.value, {
            offMultiplier: 0,
            announceMinMultiplier: 0.85,
            announceMaxMultiplier: 1.15,
            inUseMultiplier: 1.25,
        });
        return multiplyColorAlpha(orbTheme.outerGlow.value, multiplier);
    });

    return { edge, innerShadowBR, innerShadowGradient, gradient, glow };
}

interface OrbDefinition {
    cxRatio: number;
    cyRatio: number;
    radiusRatio: number;
}

interface OrbGeometry {
    index: number;
    cx: number;
    cy: number;
    baseRadius: number;
    radius: SharedValue<number>;
}

interface OrbSceneLightSpec extends ConnectionLightMotionSpec {
    index: number;
    motionIndex: number;
    seed: number;
}

interface OrbSceneLaneLightSpec {
    id: string;
    orbIndex: number;
    effectiveRadius: number;
    secondLastPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    lights: OrbSceneLightSpec[];
}

interface OrbTone {
    rgb: string;
    alpha: number;
}

interface OrbTheme {
    radialInner: OrbTone;
    radialOuter: OrbTone;
    innerShadowBR: OrbTone;
    outerGlow: OrbTone;
}

interface OrbSceneTheme {
    orb: OrbTheme;
    titleColor: string;
    statusLeadColor: string;

    metricColor: string;
    hintColor: string;
}

const ORB_LAYOUTS: Record<OrbEvolutionLevel, OrbDefinition[]> = {
    0: [{ cxRatio: 0.5, cyRatio: 0.45, radiusRatio: 0.26 }],
    1: [{ cxRatio: 0.5, cyRatio: 0.45, radiusRatio: 0.26 }],
    2: [
        { cxRatio: 0.2, cyRatio: 0.33, radiusRatio: 0.1 },
        { cxRatio: 0.5, cyRatio: 0.44, radiusRatio: 0.22 },
        { cxRatio: 0.79, cyRatio: 0.24, radiusRatio: 0.075 },
    ],
    3: [
        { cxRatio: 0.2, cyRatio: 0.33, radiusRatio: 0.1 },
        { cxRatio: 0.5, cyRatio: 0.44, radiusRatio: 0.22 },
        { cxRatio: 0.79, cyRatio: 0.24, radiusRatio: 0.075 },
    ],
};

const SCENE_THEMES: Record<OrbEvolutionLevel, OrbSceneTheme> = {
    0: {
        // local off, no sub
        orb: {
            radialInner: {
                rgb: "rgb(169,140,206)",
                alpha: 0.3,
            },
            radialOuter: {
                rgb: "rgb(194,170,224)",
                alpha: 0.54,
            },
            innerShadowBR: {
                rgb: "rgb(246,192,179)",
                alpha: 1,
            },
            outerGlow: {
                rgb: "rgb(205,185,228)",
                alpha: 0.34,
            },
        },
        titleColor: palette.white,
        statusLeadColor: palette.white,

        metricColor: "rgba(255,255,255,0.88)",
        hintColor: "rgba(255,255,255,0.9)",
    },
    1: {
        // local on, no sub
        orb: {
            radialInner: {
                rgb: "rgb(203,156,195)",
                alpha: 0.4,
            },
            radialOuter: {
                rgb: "rgb(230, 154, 140)",
                alpha: 0.46,
            },
            innerShadowBR: {
                rgb: "rgb(246,192,179)",
                alpha: 1,
            },
            outerGlow: {
                rgb: "rgb(255,255,255)",
                alpha: 0.34,
            },
        },
        titleColor: palette.white,
        statusLeadColor: palette.black,
        metricColor: "rgba(41,30,42,0.92)",
        hintColor: palette.black,
    },
    2: {
        // local off, yes sub
        orb: {
            radialInner: {
                rgb: "rgb(155,127,200)",
                alpha: 0.3,
            },
            radialOuter: {
                rgb: "rgb(87, 63, 126)",
                alpha: 0.56,
            },
            innerShadowBR: {
                rgb: "rgb(181,146,215)",
                alpha: 1,
            },
            outerGlow: {
                rgb: "rgb(245,186,164)",
                alpha: 0.34,
            },
        },
        titleColor: palette.white,
        statusLeadColor: palette.black,
        metricColor: "rgba(38,30,45,0.92)",
        hintColor: palette.black,
    },
    3: {
        // local on, yes sub
        orb: {
            radialInner: {
                rgb: "rgb(203,156,195)",
                alpha: 0.3,
            },
            radialOuter: {
                rgb: "rgb(230, 154, 140)",
                alpha: 0.54,
            },
            innerShadowBR: {
                rgb: "rgb(246,192,179)",
                alpha: 1,
            },
            outerGlow: {
                rgb: "rgb(255,255,255)",
                alpha: 0.54,
            },
        },
        titleColor: palette.white,
        statusLeadColor: "rgba(195,228,255,0.94)",
        metricColor: "rgba(252,252,255,0.92)",
        hintColor: "rgba(243,249,255,0.92)",
    },
};

const PROVISIONING_MARKER_ORBIT_DURATION_MS = 5600;
const PROVISIONING_MARKER_GLOW_COLORS = [
    rgbaFromRgb(
        SCENE_THEMES[HOSTED_ORB_THEME_LEVEL].orb.innerShadowBR.rgb,
        0.72,
    ),
    rgbaFromRgb(SCENE_THEMES[HOSTED_ORB_THEME_LEVEL].orb.radialInner.rgb, 0.42),
    rgbaFromRgb(SCENE_THEMES[HOSTED_ORB_THEME_LEVEL].orb.radialOuter.rgb, 0),
];
const PROVISIONING_MARKER_GLOW_POSITIONS = [0, 0.34, 1];

function OrbGestureOverlay({
    centerX,
    centerY,
    radius,
    baseRadius,
    enabled,
    highlighted = false,
    accessibilityLabel,
    testID,
    onTapAction,
    onLongPressAction,
}: OrbGestureOverlayProps) {
    const { t } = useTranslation();
    const e2e = isE2E();
    const onTapActionRef = React.useRef(onTapAction);
    const onLongPressActionRef = React.useRef(onLongPressAction);

    React.useEffect(() => {
        onTapActionRef.current = onTapAction;
    }, [onTapAction]);

    React.useEffect(() => {
        onLongPressActionRef.current = onLongPressAction;
    }, [onLongPressAction]);

    const runTapAction = React.useCallback(() => {
        onTapActionRef.current?.();
    }, []);

    const runLongPressAction = React.useCallback(() => {
        onLongPressActionRef.current?.();
    }, []);

    const animateGiggle = React.useCallback(() => {
        "worklet";
        radius.value = withSequence(
            withTiming(baseRadius * 0.97, { duration: 55 }),
            withSpring(baseRadius, {
                dampingRatio: 0.45,
                stiffness: 120,
                restDisplacementThreshold: 0.01,
                restSpeedThreshold: 2,
            }),
        );
    }, [baseRadius, radius]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            position: "absolute",
            left: centerX.value - radius.value,
            top: centerY.value - radius.value,
            width: radius.value * 2,
            height: radius.value * 2,
            borderRadius: radius.value,
            backgroundColor: "transparent",
        };
    }, [centerX, centerY, radius]);

    const highlightStyle = React.useMemo(
        () =>
            highlighted
                ? {
                      borderWidth: 2,
                      borderColor: "rgba(255, 255, 255, 0.92)",
                  }
                : null,
        [highlighted],
    );

    const tapGesture = React.useMemo(
        () =>
            Gesture.Tap()
                .enabled(enabled)
                .onEnd(() => {
                    if (!enabled) {
                        return;
                    }
                    animateGiggle();
                    if (!e2e) {
                        runOnJS(Haptics.impactAsync)(
                            Haptics.ImpactFeedbackStyle.Medium,
                        );
                    }
                    runOnJS(runTapAction)();
                }),
        [animateGiggle, e2e, enabled, runTapAction],
    );

    const longPressEnabled = Boolean(onLongPressAction) && enabled;

    const longPressGesture = React.useMemo(
        () =>
            Gesture.LongPress()
                .enabled(longPressEnabled)
                .minDuration(1100)
                .onBegin(() => {
                    radius.value = withTiming(baseRadius * 0.85, {
                        duration: 1200,
                    });
                    if (!e2e) {
                        runOnJS(Haptics.impactAsync)(
                            Haptics.ImpactFeedbackStyle.Soft,
                        );
                    }
                })
                .onStart(() => {
                    if (!longPressEnabled) {
                        return;
                    }
                    if (!e2e) {
                        runOnJS(Haptics.impactAsync)(
                            Haptics.ImpactFeedbackStyle.Heavy,
                        );
                    }
                    runOnJS(runLongPressAction)();
                })
                .onFinalize(() => {
                    animateGiggle();
                }),
        [
            animateGiggle,
            baseRadius,
            e2e,
            longPressEnabled,
            radius,
            runLongPressAction,
        ],
    );

    const gesture = React.useMemo(
        () => Gesture.Exclusive(tapGesture, longPressGesture),
        [longPressGesture, tapGesture],
    );

    const accessibilityProps = enabled
        ? {
              accessible: true,
              accessibilityRole: "button" as const,
              accessibilityLabel:
                  accessibilityLabel ??
                  t("CONDUIT_ORB_TAP_ACCESSIBILITY_I18N.string"),
          }
        : {
              accessible: false,
          };

    const overlay = (
        <Animated.View
            testID={e2e ? undefined : testID}
            {...(!e2e ? accessibilityProps : { accessible: false })}
            pointerEvents={enabled ? "auto" : "none"}
            style={[animatedStyle, highlightStyle]}
        />
    );

    if (!enabled) {
        return highlighted ? overlay : null;
    }

    if (e2e && testID) {
        return (
            <Pressable
                testID={testID}
                {...accessibilityProps}
                onPress={runTapAction}
                onLongPress={onLongPressAction ? runLongPressAction : undefined}
                style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: 0,
                }}
            >
                {overlay}
            </Pressable>
        );
    }

    return <GestureDetector gesture={gesture}>{overlay}</GestureDetector>;
}

interface ProvisioningMarkerProps {
    marker: RenderedProvisioningMarker;
    centerX: SharedValue<number>;
    centerY: SharedValue<number>;
    radius: SharedValue<number>;
    reducedMotion: boolean;
    onExited: (id: string) => void;
}

function OrbProvisioningMarker({
    marker,
    centerX,
    centerY,
    radius,
    reducedMotion,
    onExited,
}: ProvisioningMarkerProps) {
    const orbit = useSharedValue(0);
    const opacity = useSharedValue(0);
    const scale = useSharedValue(0.55);
    const phaseOffset = React.useMemo(
        () => seededTopRightPhase(marker.id),
        [marker.id],
    );

    React.useEffect(() => {
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
    }, [marker.active, marker.id, onExited, opacity, scale]);

    React.useEffect(() => {
        cancelAnimation(orbit);
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
    }, [orbit, reducedMotion]);

    const markerCenter = useDerivedValue(() => {
        const phase = reducedMotion ? 0.875 : (orbit.value + phaseOffset) % 1;
        const angle = phase * Math.PI * 2;
        const orbitRadius = radius.value * 1.08;
        return vec(
            centerX.value + Math.cos(angle) * orbitRadius,
            centerY.value + Math.sin(angle) * orbitRadius,
        );
    }, [centerX, centerY, orbit, phaseOffset, radius, reducedMotion]);

    const markerX = useDerivedValue(() => markerCenter.value.x, [markerCenter]);
    const markerY = useDerivedValue(() => markerCenter.value.y, [markerCenter]);
    const markerGlowRadius = useDerivedValue(
        () => clampNumber(radius.value * 0.18, 11, 24) * scale.value,
        [radius, scale],
    );
    const markerOpacity = useDerivedValue(() => opacity.value, [opacity]);

    return (
        <Group
            opacity={markerOpacity}
            layer={
                <Paint>
                    <Blur blur={1} />
                </Paint>
            }
        >
            <Circle cx={markerX} cy={markerY} r={markerGlowRadius}>
                <RadialGradient
                    c={markerCenter}
                    r={markerGlowRadius}
                    colors={PROVISIONING_MARKER_GLOW_COLORS}
                    positions={PROVISIONING_MARKER_GLOW_POSITIONS}
                />
            </Circle>
        </Group>
    );
}

export function OrbScene(props: OrbSceneProps) {
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
    } = props;
    const { t } = useTranslation();
    const appIsActive = useAppIsActive();
    const reducedMotion = useReducedMotionPreference() || isE2E();
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
    const sceneBlurRadius = useSharedValue(applyBlur ? 6 : 0);
    const sceneLightElapsedMs = useSharedValue(0);
    const updateSceneLightClock = React.useCallback(
        (frameInfo: { timeSincePreviousFrame: number | null }) => {
            "worklet";
            if (frameInfo.timeSincePreviousFrame != null) {
                sceneLightElapsedMs.value += frameInfo.timeSincePreviousFrame;
            }
        },
        [sceneLightElapsedMs],
    );
    const sceneLightFrameCallback = useFrameCallback(
        updateSceneLightClock,
        false,
    );
    const entryOpacity = useSharedValue(0);
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
    // Swap animation: a single progress value (0→1) drives smooth
    // sine-based arcing paths for both swapping orbs.
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
    const orbRadiusValues = React.useMemo(
        () => [orbRadius0, orbRadius1, orbRadius2],
        [orbRadius0, orbRadius1, orbRadius2],
    );
    const localOrbThemeProgress = useSharedValue<number>(targetThemeLevel);
    const hostedOrbThemeProgress = useSharedValue<number>(
        HOSTED_ORB_THEME_LEVEL,
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
        sceneLightFrameCallback.setActive(appIsActive && !reducedMotion);
        return () => sceneLightFrameCallback.setActive(false);
    }, [appIsActive, reducedMotion, sceneLightFrameCallback]);

    React.useEffect(() => {
        sceneBlurRadius.value = applyBlur ? 6 : 0;
    }, [applyBlur, sceneBlurRadius]);

    React.useEffect(() => {
        const nextMarkers = normalizeProvisioningMarkers(provisioningMarkers);
        setRenderedProvisioningMarkers((previousMarkers) => {
            const nextById = new Map(
                nextMarkers.map((marker) => [marker.id, marker]),
            );
            const merged: RenderedProvisioningMarker[] = [];

            for (const marker of nextMarkers) {
                merged.push({
                    ...marker,
                    active: true,
                });
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

    React.useEffect(() => {
        entryOpacity.value = withDelay(80, withTiming(1, { duration: 720 }));
        return () => {
            cancelAnimation(entryOpacity);
            cancelAnimation(orbColorIndex0);
            cancelAnimation(orbColorIndex1);
            cancelAnimation(orbColorIndex2);
        };
    }, [entryOpacity, orbColorIndex0, orbColorIndex1, orbColorIndex2]);

    const hasAnnouncingMode =
        (orbModes?.[0] ?? "off") === "announcing" ||
        (orbModes?.[1] ?? "off") === "announcing" ||
        (orbModes?.[2] ?? "off") === "announcing";

    React.useEffect(() => {
        cancelAnimation(colorLfo);
        colorLfo.value = 0;
        if (hasAnnouncingMode) {
            colorLfo.value = withRepeat(
                withTiming(1, { duration: 4200 }),
                -1,
                true,
            );
        }
        return () => cancelAnimation(colorLfo);
    }, [colorLfo, hasAnnouncingMode]);

    React.useEffect(() => {
        localOrbThemeProgress.value = withTiming(targetThemeLevel, {
            duration: 550,
        });
    }, [localOrbThemeProgress, targetThemeLevel]);

    React.useEffect(() => {
        const modes = [
            orbModes?.[0] ?? "off",
            orbModes?.[1] ?? "off",
            orbModes?.[2] ?? "off",
        ] as OrbVisualMode[];
        const previousModes = previousModesRef.current;
        [orbColorIndex0, orbColorIndex1, orbColorIndex2].forEach(
            (indexValue, orbIndex) => {
                const mode = modes[orbIndex];
                const prevMode = previousModes[orbIndex];
                if (mode === prevMode) {
                    return;
                }
                cancelAnimation(indexValue);
                indexValue.value = withTiming(
                    mode === "off" ? 0 : mode === "announcing" ? 1 : 2,
                    {
                        duration: mode === "in_use" ? 1300 : 500,
                    },
                );
            },
        );
        previousModesRef.current = modes;
    }, [orbColorIndex0, orbColorIndex1, orbColorIndex2, orbModes]);

    const localOrbTheme = useInterpolatedOrbTheme(localOrbThemeProgress);
    const hostedOrbTheme = useInterpolatedOrbTheme(hostedOrbThemeProgress);
    const orb0UsesLocalTheme = localOrbIndex === 0 || evolutionLevel === 0;
    const orbTheme0 = orb0UsesLocalTheme ? localOrbTheme : hostedOrbTheme;
    const orbTheme1 = localOrbIndex === 1 ? localOrbTheme : hostedOrbTheme;
    const orbTheme2 = localOrbIndex === 2 ? localOrbTheme : hostedOrbTheme;
    const orbPalette0 = useOrbPalette(orbColorIndex0, colorLfo, orbTheme0);
    const orbPalette1 = useOrbPalette(orbColorIndex1, colorLfo, orbTheme1);
    const orbPalette2 = useOrbPalette(orbColorIndex2, colorLfo, orbTheme2);
    const orbEdgeColorValues = [
        orbPalette0.edge,
        orbPalette1.edge,
        orbPalette2.edge,
    ];
    const orbInnerShadowGradientValues = [
        orbPalette0.innerShadowGradient,
        orbPalette1.innerShadowGradient,
        orbPalette2.innerShadowGradient,
    ];
    const orbGradientValues = [
        orbPalette0.gradient,
        orbPalette1.gradient,
        orbPalette2.gradient,
    ];
    const orbGlowValues = [
        orbPalette0.glow,
        orbPalette1.glow,
        orbPalette2.glow,
    ];

    const orbLayout = React.useMemo(
        () => ORB_LAYOUTS[evolutionLevel].slice(0, resolvedMaxVisibleOrbs),
        [evolutionLevel, resolvedMaxVisibleOrbs],
    );
    const orbGeometries = React.useMemo<OrbGeometry[]>(
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
    const orbCenter0 = useDerivedValue(() => vec(orbCx0.value, orbCy0.value));
    const orbCenter1 = useDerivedValue(() => vec(orbCx1.value, orbCy1.value));
    const orbCenter2 = useDerivedValue(() => vec(orbCx2.value, orbCy2.value));
    const orbCenterValues = React.useMemo(
        () => [orbCenter0, orbCenter1, orbCenter2],
        [orbCenter0, orbCenter1, orbCenter2],
    );

    const orbLightTransform0 = useDerivedValue(() => [
        { translateX: orbCx0.value },
        { translateY: orbCy0.value },
    ]);
    const orbLightTransform1 = useDerivedValue(() => [
        { translateX: orbCx1.value },
        { translateY: orbCy1.value },
    ]);
    const orbLightTransform2 = useDerivedValue(() => [
        { translateX: orbCx2.value },
        { translateY: orbCy2.value },
    ]);
    const orbLightTransformValues = React.useMemo(
        () => [orbLightTransform0, orbLightTransform1, orbLightTransform2],
        [orbLightTransform0, orbLightTransform1, orbLightTransform2],
    );

    const orbShadowCenter0 = useDerivedValue(() =>
        vec(
            orbCx0.value - orbRadius0.value * 0.13,
            orbCy0.value - orbRadius0.value * 0.13,
        ),
    );
    const orbShadowCenter1 = useDerivedValue(() =>
        vec(
            orbCx1.value - orbRadius1.value * 0.13,
            orbCy1.value - orbRadius1.value * 0.13,
        ),
    );
    const orbShadowCenter2 = useDerivedValue(() =>
        vec(
            orbCx2.value - orbRadius2.value * 0.13,
            orbCy2.value - orbRadius2.value * 0.13,
        ),
    );
    const orbShadowRadius0 = useDerivedValue(
        () => orbRadius0.value * 1.25,
        [orbRadius0],
    );
    const orbShadowRadius1 = useDerivedValue(
        () => orbRadius1.value * 1.25,
        [orbRadius1],
    );
    const orbShadowRadius2 = useDerivedValue(
        () => orbRadius2.value * 1.25,
        [orbRadius2],
    );
    const orbShadowCenterValues = [
        orbShadowCenter0,
        orbShadowCenter1,
        orbShadowCenter2,
    ];
    const orbShadowRadiusValues = [
        orbShadowRadius0,
        orbShadowRadius1,
        orbShadowRadius2,
    ];
    const orbRingR0 = useDerivedValue(
        () => orbRadius0.value * 1.25,
        [orbRadius0],
    );
    const orbRingR1 = useDerivedValue(
        () => orbRadius1.value * 1.25,
        [orbRadius1],
    );
    const orbRingR2 = useDerivedValue(
        () => orbRadius2.value * 1.25,
        [orbRadius2],
    );
    const orbRingRValues = [orbRingR0, orbRingR1, orbRingR2];

    const orb0BaseRadius = orbGeometries[0]?.baseRadius ?? 0;
    const orb1BaseRadius = orbGeometries[1]?.baseRadius ?? 0;
    const orb2BaseRadius = orbGeometries[2]?.baseRadius ?? 0;

    const orbSlotMapKey = (orbSlotMap ?? DEFAULT_ORB_SLOT_MAP).join(",");
    const effectiveSlotMap = React.useMemo(
        () => [...(orbSlotMap ?? DEFAULT_ORB_SLOT_MAP)],
        // The semantic map, rather than a polling-created array, drives swaps.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [orbSlotMapKey],
    );

    // Effective base radius per orb, resolved through the slot map so
    // lights scale to the correct orb size after a swap.
    const orbEffectiveBaseRadius = React.useMemo(
        () =>
            orbGeometries.map((orb, index) => {
                const slot = effectiveSlotMap[index] ?? index;
                return orbGeometries[slot]?.baseRadius ?? orb.baseRadius;
            }),
        [effectiveSlotMap, orbGeometries],
    );

    // Per-frame arc computation driven by swapT (0→1).
    // position(t) = lerp(from, to, t) + perp * sin(π·t) * arcScale
    // Orb A arcs one direction, orb B arcs the opposite.
    useAnimatedReaction(
        () => swapT.value,
        (t) => {
            "worklet";
            const s = swapInfo.value;
            if (s.a < 0 || s.b < 0) return;
            if (t <= 0) return;

            const sinArc = Math.sin(Math.PI * Math.min(t, 1));

            // Orb A
            const ax = s.fromAx + (s.toAx - s.fromAx) * t + s.px * sinArc;
            const ay = s.fromAy + (s.toAy - s.fromAy) * t + s.py * sinArc;
            // Orb B (opposite arc)
            const bx = s.fromBx + (s.toBx - s.fromBx) * t - s.px * sinArc;
            const by = s.fromBy + (s.toBy - s.fromBy) * t - s.py * sinArc;

            // Radius interpolation
            const rA = s.fromRadA + (s.toRadA - s.fromRadA) * Math.min(t, 1);
            const rB = s.fromRadB + (s.toRadB - s.fromRadB) * Math.min(t, 1);

            // Write to the correct orbs
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

    const previousSlotMapRef = React.useRef<number[]>([0, 1, 2]);

    React.useEffect(() => {
        const prevMap = previousSlotMapRef.current;
        const allCx = [orbCx0, orbCx1, orbCx2];
        const allCy = [orbCy0, orbCy1, orbCy2];
        const allRadius = [orbRadius0, orbRadius1, orbRadius2];

        // Detect which orbs swapped (position changed significantly)
        const swapPairs: [number, number][] = [];
        const visited = new Set<number>();
        for (let i = 0; i < orbGeometries.length; i++) {
            if (visited.has(i)) continue;
            const prevSlot = prevMap[i] ?? i;
            const nextSlot = effectiveSlotMap[i] ?? i;
            if (prevSlot !== nextSlot) {
                // Find the partner that swapped with this orb
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

        // For each swap pair, set up the arc geometry and kick off a
        // single progress animation (swapT 0→1). The useAnimatedReaction
        // above drives per-frame position updates using sin(π·t).
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

            // Perpendicular direction for arc offset
            const dx = toAx - fromAx;
            const dy = toAy - fromAy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const arcMag = dist * 0.4;
            const px = dist > 0 ? (-dy / dist) * arcMag : 0;
            const py = dist > 0 ? (dx / dist) * arcMag : 0;

            const targetRadiusA = orbGeometries[targetSlotA]?.baseRadius ?? 0;
            const targetRadiusB = orbGeometries[targetSlotB]?.baseRadius ?? 0;

            // Store all arc geometry for the UI-thread reaction
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

            // Animate progress 0→1. Easing gives a single fluid motion;
            // the sine formula in the reaction produces the arc.
            cancelAnimation(swapT);
            swapT.value = 0;
            swapT.value = withTiming(1, {
                duration: 800,
                easing: Easing.inOut(Easing.cubic),
            });
        }

        // Handle non-swapping orbs (direct set or spring for radius)
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
                // Significant position change but not a swap — animate directly
                allCx[i].value = withTiming(targetCx, { duration: 500 });
                allCy[i].value = withTiming(targetCy, { duration: 500 });
            } else {
                allCx[i].value = targetCx;
                allCy[i].value = targetCy;
            }

            if (targetRadius <= 0) {
                allRadius[i].value = withTiming(0, { duration: 160 });
            } else {
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
            }
        }

        previousSlotMapRef.current = [...effectiveSlotMap];
    }, [
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
    const laneLightSpecs = React.useMemo<OrbSceneLaneLightSpec[]>(() => {
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
    const sceneLightSpecs = React.useMemo(
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
    const proxyReachByOrb = React.useMemo(() => {
        const reaches = orbGeometries.map(() => 0);
        for (const lane of laneLightSpecs) {
            // The envelope reaches zero before the furthest inbound/outbound
            // path points; 2r plus the proxy circle is conservative.
            reaches[lane.orbIndex] = Math.max(
                reaches[lane.orbIndex] ?? 0,
                lane.effectiveRadius * 2 + lane.effectiveRadius / 8,
            );
        }
        return reaches;
    }, [laneLightSpecs, orbGeometries]);
    const morphClip = useDerivedValue(() => {
        const bounds = calculateOrbMorphClipBounds(
            width,
            height,
            orbGeometries.map((orb, index) => ({
                centerX: orbCxValues[index].value,
                centerY: orbCyValues[index].value,
                radius: orb.radius.value,
                proxyReach: proxyReachByOrb[index] ?? 0,
            })),
            MORPH_BLUR_SUPPORT,
            MORPH_AA_PADDING,
        );
        return rect(bounds.x, bounds.y, bounds.width, bounds.height);
    }, [
        height,
        orbCxValues,
        orbCyValues,
        orbGeometries,
        proxyReachByOrb,
        width,
    ]);
    const visibleProvisioningMarkers = renderedProvisioningMarkers.filter(
        (marker) =>
            marker.orbIndex >= 0 && marker.orbIndex < orbGeometries.length,
    );
    const activeProvisioningOrbIndexes = new Set(
        visibleProvisioningMarkers
            .filter((marker) => marker.active)
            .map((marker) => marker.orbIndex),
    );

    const morphLayer = React.useMemo(() => {
        return (
            <Paint>
                <Blur blur={MORPH_BLUR_RADIUS} />
                <ColorMatrix
                    // prettier-ignore
                    matrix={[
                        1, 0, 0, 0, 0,
                        0, 1, 0, 0, 0,
                        0, 0, 1, 0, 0,
                        0, 0, 0, 5, -2,
                    ]}
                />
            </Paint>
        );
    }, []);
    const sceneLayer = React.useMemo(
        () => (
            <Paint>
                <Blur blur={sceneBlurRadius} />
            </Paint>
        ),
        [sceneBlurRadius],
    );

    function renderGlow() {
        return (
            <Group opacity={entryOpacity}>
                {orbGeometries.map((orb, index) => {
                    const orbGlow = orbGlowValues[index];

                    return (
                        <OrbGlow
                            key={`orb-glow-${index}`}
                            center={orbCenterValues[index]}
                            centerX={orbCxValues[index]}
                            centerY={orbCyValues[index]}
                            radius={orb.radius}
                            color={orbGlow}
                        />
                    );
                })}
            </Group>
        );
    }

    function renderMorphAndVisibleLights() {
        return (
            <>
                <Group clip={morphClip}>
                    <Group layer={morphLayer} opacity={entryOpacity}>
                        {orbGeometries.map((orb, index) => {
                            const orbEdgeColor = orbEdgeColorValues[index];
                            const orbGradient = orbGradientValues[index];
                            const ringR = orbRingRValues[index];

                            return (
                                <Group key={`orb-morph-${index}`}>
                                    <Circle
                                        cx={orbCxValues[index]}
                                        cy={orbCyValues[index]}
                                        r={orb.radius}
                                    >
                                        <RadialGradient
                                            c={orbCenterValues[index]}
                                            r={orb.radius}
                                            colors={orbGradient}
                                        />
                                    </Circle>
                                    <Circle
                                        cx={orbCxValues[index]}
                                        cy={orbCyValues[index]}
                                        r={orb.radius}
                                        style="stroke"
                                        strokeWidth={1.2}
                                        color={orbEdgeColor}
                                        opacity={0.42}
                                    />
                                    {/* Morph ring: a soft alpha halo just
                                    outside the orb that the blur+threshold goo
                                    turns into an organic living edge. */}
                                    <Circle
                                        cx={orbCxValues[index]}
                                        cy={orbCyValues[index]}
                                        r={ringR}
                                    >
                                        <RadialGradient
                                            c={orbCenterValues[index]}
                                            r={ringR}
                                            colors={[
                                                "rgba(0,0,0,0)",
                                                "rgba(255,230,218,0.22)",
                                                "rgba(0,0,0,0)",
                                            ]}
                                            positions={[0.65, 0.82, 1.0]}
                                        />
                                    </Circle>
                                </Group>
                            );
                        })}
                        {/* Both copies select the same scene motion slot. */}
                        {laneLightSpecs.map((lane) => {
                            return (
                                <Group
                                    key={`morph-lane-${lane.id}`}
                                    transform={
                                        orbLightTransformValues[lane.orbIndex]
                                    }
                                >
                                    {lane.lights.map((light) => (
                                        <ConduitConnectionLight
                                            key={`morph-${lane.id}-${light.index}-${Math.round(lane.effectiveRadius)}`}
                                            active={true}
                                            orbRadius={lane.effectiveRadius}
                                            midPoint={
                                                CONNECTION_LIGHT_MID_POINT
                                            }
                                            secondLastPoint={
                                                lane.secondLastPoint
                                            }
                                            endPoint={lane.endPoint}
                                            randomize={true}
                                            asMorphProxy={true}
                                            sharedMotionBuffer={
                                                sceneLightMotionBuffer
                                            }
                                            sharedMotionIndex={
                                                light.motionIndex
                                            }
                                        />
                                    ))}
                                </Group>
                            );
                        })}
                    </Group>
                </Group>

                {/* Visible lights stay above the thresholded morph layer. */}
                <Group opacity={entryOpacity}>
                    {laneLightSpecs.map((lane) => {
                        return (
                            <Group
                                key={`lane-${lane.id}`}
                                transform={
                                    orbLightTransformValues[lane.orbIndex]
                                }
                            >
                                {lane.lights.map((light) => (
                                    <ConduitConnectionLight
                                        key={`lane-${lane.id}-light-${light.index}-${Math.round(lane.effectiveRadius)}`}
                                        active={true}
                                        orbRadius={lane.effectiveRadius}
                                        midPoint={CONNECTION_LIGHT_MID_POINT}
                                        secondLastPoint={lane.secondLastPoint}
                                        endPoint={lane.endPoint}
                                        randomize={true}
                                        sharedMotionBuffer={
                                            sceneLightMotionBuffer
                                        }
                                        sharedMotionIndex={light.motionIndex}
                                    />
                                ))}
                            </Group>
                        );
                    })}
                </Group>
            </>
        );
    }

    function renderDetail() {
        return (
            <>
                <Group opacity={entryOpacity}>
                    {orbGeometries.map((orb, index) => {
                        const orbInnerShadowGradient =
                            orbInnerShadowGradientValues[index];
                        const orbShadowCenter = orbShadowCenterValues[index];
                        const orbShadowRadius = orbShadowRadiusValues[index];

                        return (
                            <Group key={`orb-shadow-${index}`}>
                                <Circle
                                    cx={orbCxValues[index]}
                                    cy={orbCyValues[index]}
                                    r={orb.radius}
                                >
                                    <RadialGradient
                                        c={orbShadowCenter}
                                        r={orbShadowRadius}
                                        colors={orbInnerShadowGradient}
                                        positions={[0.66, 1]}
                                    />
                                </Circle>
                            </Group>
                        );
                    })}
                </Group>

                <Group>
                    {visibleProvisioningMarkers.map((marker) => (
                        <OrbProvisioningMarker
                            key={`provisioning-marker-${marker.id}`}
                            marker={marker}
                            centerX={orbCxValues[marker.orbIndex]}
                            centerY={orbCyValues[marker.orbIndex]}
                            radius={orbRadiusValues[marker.orbIndex]}
                            reducedMotion={reducedMotion}
                            onExited={handleProvisioningMarkerExited}
                        />
                    ))}
                </Group>
            </>
        );
    }

    const sceneContent = (
        <Group>
            {renderGlow()}
            {renderMorphAndVisibleLights()}
            {renderDetail()}
        </Group>
    );

    return (
        <View style={{ width, height, backgroundColor: "transparent" }}>
            <Canvas style={ss.flex}>
                <Group layer={sceneLayer}>{sceneContent}</Group>
            </Canvas>

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
                    {headerTitle ? (
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
                    ) : null}
                </View>
            ) : null}

            {pressHint ? (
                <Animated.View
                    pointerEvents="none"
                    style={[
                        {
                            position: "absolute",
                            top: height * statusTopRatio,
                            width: "100%",
                            alignItems: "center",
                            paddingHorizontal: 16,
                        },
                    ]}
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
                </Animated.View>
            ) : null}
        </View>
    );
}

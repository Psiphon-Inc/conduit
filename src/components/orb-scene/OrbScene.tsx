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
    vec,
} from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import React from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
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
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";

import { multiplyColorAlpha, rgbaFromRgb } from "@/src/common/colorUtils";
import { ConduitConnectionLight } from "@/src/components/canvas/ConduitConnectionLight";
import {
    clampLights,
    modeMultiplier,
} from "@/src/components/orb-scene/orbUtils";
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
    activityLanes?: OrbSceneActivityLane[];
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
    onTapAction?: () => void;
    onLongPressAction?: () => void;
}

const THEME_LEVELS: OrbEvolutionLevel[] = [0, 1, 2, 3];
const HOSTED_ORB_THEME_LEVEL: OrbEvolutionLevel = 3;

/** DJB2 hash producing a stable unsigned-integer seed for a light instance. */
function lightSeed(key: string): number {
    let hash = 5381;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
    }
    return hash >>> 0;
}

interface OrbAnimatedTheme {
    radialInner: SharedValue<string>;
    radialOuter: SharedValue<string>;
    innerShadowBR: SharedValue<string>;
    outerGlow: SharedValue<string>;
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

function OrbGestureOverlay({
    centerX,
    centerY,
    radius,
    baseRadius,
    enabled,
    highlighted = false,
    accessibilityLabel,
    onTapAction,
    onLongPressAction,
}: OrbGestureOverlayProps) {
    const { t } = useTranslation();
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
                    runOnJS(Haptics.impactAsync)(
                        Haptics.ImpactFeedbackStyle.Medium,
                    );
                    runOnJS(runTapAction)();
                }),
        [animateGiggle, enabled, runTapAction],
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
                    runOnJS(Haptics.impactAsync)(
                        Haptics.ImpactFeedbackStyle.Soft,
                    );
                })
                .onStart(() => {
                    if (!longPressEnabled) {
                        return;
                    }
                    runOnJS(Haptics.impactAsync)(
                        Haptics.ImpactFeedbackStyle.Heavy,
                    );
                    runOnJS(runLongPressAction)();
                })
                .onFinalize(() => {
                    animateGiggle();
                }),
        [
            animateGiggle,
            baseRadius,
            longPressEnabled,
            radius,
            runLongPressAction,
        ],
    );

    const gesture = React.useMemo(
        () => Gesture.Exclusive(tapGesture, longPressGesture),
        [longPressGesture, tapGesture],
    );

    return (
        <GestureDetector gesture={gesture}>
            <Animated.View
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={
                    accessibilityLabel ??
                    t("CONDUIT_ORB_TAP_ACCESSIBILITY_I18N.string")
                }
                style={[animatedStyle, highlightStyle]}
            />
        </GestureDetector>
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
        activityLanes,
        orbModes,
        localOrbIndex,
        highlightedOrbIndex,
        statusOpacity = 1,
        statusTopRatio = 0.68,
        orbSlotMap,
    } = props;
    const { t } = useTranslation();
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
    const orbCxValues = [orbCx0, orbCx1, orbCx2];
    const orbCyValues = [orbCy0, orbCy1, orbCy2];
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
    const orbRadiusValues = [orbRadius0, orbRadius1, orbRadius2];
    const statusFader = useSharedValue(statusOpacity);
    const localOrbThemeProgress = useSharedValue<number>(targetThemeLevel);
    const hostedOrbThemeProgress = useSharedValue<number>(
        HOSTED_ORB_THEME_LEVEL,
    );
    const previousModesRef = React.useRef<OrbVisualMode[]>([
        "off",
        "off",
        "off",
    ]);

    React.useEffect(() => {
        entryOpacity.value = withDelay(80, withTiming(1, { duration: 720 }));
        colorLfo.value = withRepeat(
            withTiming(1, { duration: 4200 }),
            -1,
            true,
        );
        return () => {
            cancelAnimation(entryOpacity);
            cancelAnimation(colorLfo);
            cancelAnimation(orbColorIndex0);
            cancelAnimation(orbColorIndex1);
            cancelAnimation(orbColorIndex2);
        };
    }, [
        colorLfo,
        entryOpacity,
        orbColorIndex0,
        orbColorIndex1,
        orbColorIndex2,
    ]);

    React.useEffect(() => {
        statusFader.value = withTiming(statusOpacity, { duration: 350 });
    }, [statusFader, statusOpacity]);

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

    const orbLayout = ORB_LAYOUTS[evolutionLevel].slice(
        0,
        resolvedMaxVisibleOrbs,
    );
    const orbGeometries = orbLayout.map((orb, index) => ({
        index,
        cx: width * orb.cxRatio,
        cy: height * orb.cyRatio,
        baseRadius: sceneScale * orb.radiusRatio * resolvedOrbRadiusScale,
        radius: orbRadiusValues[index],
    }));
    const orbCenter0 = useDerivedValue(() => vec(orbCx0.value, orbCy0.value));
    const orbCenter1 = useDerivedValue(() => vec(orbCx1.value, orbCy1.value));
    const orbCenter2 = useDerivedValue(() => vec(orbCx2.value, orbCy2.value));
    const orbCenterValues = [orbCenter0, orbCenter1, orbCenter2];

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
    const orbLightTransformValues = [
        orbLightTransform0,
        orbLightTransform1,
        orbLightTransform2,
    ];

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

    const effectiveSlotMap = orbSlotMap ?? [0, 1, 2];

    // Effective base radius per orb, resolved through the slot map so
    // lights scale to the correct orb size after a swap.
    const orbEffectiveBaseRadius = orbGeometries.map((orb, index) => {
        const slot = effectiveSlotMap[index] ?? index;
        return orbGeometries[slot]?.baseRadius ?? orb.baseRadius;
    });

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

    const activeLanes = (activityLanes ?? []).filter((lane) => {
        if (lane.orbIndex < 0 || lane.orbIndex >= orbGeometries.length) {
            return false;
        }
        return clampLights(lane.connectedCount) > 0;
    });

    const morphLayer = React.useMemo(() => {
        return (
            <Paint>
                <Blur blur={5} />
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

    return (
        <View style={{ width, height, backgroundColor: "transparent" }}>
            <Canvas style={[ss.flex]}>
                <Group
                    layer={
                        <Paint>{applyBlur ? <Blur blur={6} /> : null}</Paint>
                    }
                >
                    <Group>
                        <Group
                            opacity={entryOpacity}
                            layer={
                                <Paint>
                                    <Blur blur={18} />
                                </Paint>
                            }
                        >
                            {orbGeometries.map((orb, index) => {
                                const orbGlow = orbGlowValues[index];

                                return (
                                    <Circle
                                        key={`orb-glow-${index}`}
                                        cx={orbCxValues[index]}
                                        cy={orbCyValues[index]}
                                        r={orb.radius}
                                        color={orbGlow}
                                    />
                                );
                            })}
                        </Group>

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
                                        {/* Morph ring: a soft alpha halo
                                            just outside the orb that the
                                            blur+threshold goo turns into
                                            an organic living edge. */}
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
                            {/* Lights inside the morph layer: their alpha
                                participates in the blur+threshold compositing
                                directly with the orb, producing organic goo
                                merging as they flow through. Seeds match the
                                visible copies outside the morph layer. */}
                            {activeLanes.map((lane) => {
                                const effRadius =
                                    orbEffectiveBaseRadius[lane.orbIndex] ??
                                    orbGeometries[lane.orbIndex]?.baseRadius ??
                                    0;
                                const lightsToRender = clampLights(
                                    lane.connectedCount,
                                );
                                const orbSizeRatio =
                                    effRadius /
                                    Math.max(
                                        sceneScale * resolvedOrbRadiusScale,
                                        1,
                                    );
                                const isHostedLane = lane.id !== "local";
                                const hostedVerticalBias = isHostedLane
                                    ? Math.max(
                                          0,
                                          Math.min(
                                              1,
                                              (0.12 - orbSizeRatio) / 0.05,
                                          ),
                                      )
                                    : 0;
                                const exitDistance =
                                    lane.id === "local"
                                        ? effRadius * 2.0
                                        : effRadius * 1.8;
                                const endPoint = vec(0, -exitDistance);
                                const secondLastPoint = vec(
                                    0,
                                    -exitDistance * 0.5,
                                );

                                return (
                                    <Group
                                        key={`morph-lane-${lane.id}`}
                                        transform={
                                            orbLightTransformValues[
                                                lane.orbIndex
                                            ]
                                        }
                                    >
                                        {Array.from(
                                            { length: lightsToRender },
                                            (_, lightIndex) => (
                                                <ConduitConnectionLight
                                                    key={`morph-${lane.id}-${lightIndex}-${Math.round(effRadius)}`}
                                                    active={true}
                                                    canvasWidth={width}
                                                    orbRadius={effRadius}
                                                    spawnXRangeScale={
                                                        lightSpawnXRangeScale
                                                    }
                                                    verticalBias={
                                                        hostedVerticalBias
                                                    }
                                                    midPoint={vec(0, 0)}
                                                    secondLastPoint={
                                                        secondLastPoint
                                                    }
                                                    endPoint={endPoint}
                                                    randomize={true}
                                                    deterministicSeed={lightSeed(
                                                        `${lane.id}-${lightIndex}`,
                                                    )}
                                                />
                                            ),
                                        )}
                                    </Group>
                                );
                            })}
                        </Group>

                        {/* Lights rendered outside the morph layer so the
                            alpha-threshold goo effect doesn't clip them to
                            the orb boundaries. */}
                        <Group opacity={entryOpacity}>
                            {activeLanes.map((lane) => {
                                const effRadius =
                                    orbEffectiveBaseRadius[lane.orbIndex] ??
                                    orbGeometries[lane.orbIndex]?.baseRadius ??
                                    0;
                                const lightsToRender = clampLights(
                                    lane.connectedCount,
                                );
                                const orbSizeRatio =
                                    effRadius /
                                    Math.max(
                                        sceneScale * resolvedOrbRadiusScale,
                                        1,
                                    );
                                const isHostedLane = lane.id !== "local";
                                const hostedVerticalBias = isHostedLane
                                    ? Math.max(
                                          0,
                                          Math.min(
                                              1,
                                              (0.12 - orbSizeRatio) / 0.05,
                                          ),
                                      )
                                    : 0;
                                const exitDistance =
                                    lane.id === "local"
                                        ? effRadius * 2.0
                                        : effRadius * 1.8;
                                const endPoint = vec(0, -exitDistance);
                                const secondLastPoint = vec(
                                    0,
                                    -exitDistance * 0.5,
                                );

                                return (
                                    <Group
                                        key={`lane-${lane.id}`}
                                        transform={
                                            orbLightTransformValues[
                                                lane.orbIndex
                                            ]
                                        }
                                    >
                                        {Array.from(
                                            { length: lightsToRender },
                                            (_, lightIndex) => (
                                                <ConduitConnectionLight
                                                    key={`lane-${lane.id}-light-${lightIndex}-${Math.round(effRadius)}`}
                                                    active={true}
                                                    canvasWidth={width}
                                                    orbRadius={effRadius}
                                                    spawnXRangeScale={
                                                        lightSpawnXRangeScale
                                                    }
                                                    verticalBias={
                                                        hostedVerticalBias
                                                    }
                                                    midPoint={vec(0, 0)}
                                                    secondLastPoint={
                                                        secondLastPoint
                                                    }
                                                    endPoint={endPoint}
                                                    randomize={true}
                                                    deterministicSeed={lightSeed(
                                                        `${lane.id}-${lightIndex}`,
                                                    )}
                                                />
                                            ),
                                        )}
                                    </Group>
                                );
                            })}
                        </Group>

                        <Group opacity={entryOpacity}>
                            {orbGeometries.map((orb, index) => {
                                const orbInnerShadowGradient =
                                    orbInnerShadowGradientValues[index];
                                const orbShadowCenter =
                                    orbShadowCenterValues[index];
                                const orbShadowRadius =
                                    orbShadowRadiusValues[index];

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
                    </Group>
                </Group>
            </Canvas>

            {orbGeometries.map((orb) => {
                const isLocalOrb =
                    localOrbIndex != null && orb.index === localOrbIndex;
                const isPrimaryOffOrb = evolutionLevel === 0 && orb.index === 0;
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
                const orbLabel = isLocalOrb
                    ? t("LOCAL_CONDUIT_ORB_ACCESSIBILITY_I18N.string")
                    : isPrimaryOffOrb
                      ? t("CONDUIT_ORB_ACCESSIBILITY_I18N.string")
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

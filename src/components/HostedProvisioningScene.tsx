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
    Canvas,
    Circle,
    Group,
    LinearGradient,
    Path,
    RadialGradient,
    Rect,
    vec,
} from "@shopify/react-native-skia";
import React from "react";
import { useTranslation } from "react-i18next";
import { TextStyle, View, ViewStyle } from "react-native";
import Animated, {
    Easing,
    Extrapolation,
    SharedValue,
    cancelAnimation,
    interpolate,
    useAnimatedStyle,
    useDerivedValue,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withRepeat,
    withTiming,
} from "react-native-reanimated";

import { OrbScene } from "@/src/components/orb-scene/OrbScene";
import { palette, sharedStyles as ss } from "@/src/styles";

export interface HostedProvisioningStatusStage {
    message: string;
    durationMs?: number;
}

let sharedProvisioningStatusStartedAtMs: number | null = null;

const CONFIRMING_DURATION_MS = 2_000;
const LAUNCHING_DURATION_MS = 5_000;
const WAITING_PROVIDER_DURATION_MS = 10_000;
const PROVISIONING_DURATION_MS = 10_000;
const SCENE_END_SECONDS = 32;
const TAU = Math.PI * 2;
const ORBITING_ORBS_ENTRY_DELAY_MS = 900;
const ORBITING_ORBS_ENTRY_DURATION_MS = 1_250;
const ORBITING_ORBS_ORBIT_DURATION_MS = 7_200;
const PROVISIONING_SCENE_BACKGROUND_COLOR = "#3269BA";

export const HOSTED_PROVISIONING_STAGE_DURATIONS_MS = {
    confirming: CONFIRMING_DURATION_MS,
    launching: LAUNCHING_DURATION_MS,
    waitingProvider: WAITING_PROVIDER_DURATION_MS,
    provisioning: PROVISIONING_DURATION_MS,
};

export function useHostedProvisioningStages(): HostedProvisioningStatusStage[] {
    const { t } = useTranslation();

    return React.useMemo(
        () => [
            {
                message: t("HOSTED_PROVISIONING_CONFIRMING_I18N.string"),
                durationMs: HOSTED_PROVISIONING_STAGE_DURATIONS_MS.confirming,
            },
            {
                message: t("HOSTED_PROVISIONING_LAUNCHING_I18N.string"),
                durationMs: HOSTED_PROVISIONING_STAGE_DURATIONS_MS.launching,
            },
            {
                message: t("HOSTED_PROVISIONING_WAITING_PROVIDER_I18N.string"),
                durationMs:
                    HOSTED_PROVISIONING_STAGE_DURATIONS_MS.waitingProvider,
            },
            {
                message: t("HOSTED_PROVISIONING_PROVISIONING_I18N.string"),
                durationMs: HOSTED_PROVISIONING_STAGE_DURATIONS_MS.provisioning,
            },
            {
                message: t("HOSTED_PROVISIONING_WAITING_METRICS_I18N.string"),
            },
        ],
        [t],
    );
}

export function useSharedHostedProvisioningStatusStartedAtMs(
    active = true,
): number | undefined {
    const [startedAtMs, setStartedAtMs] = React.useState<number | undefined>(
        () => (active ? getSharedProvisioningStatusStartedAtMs() : undefined),
    );

    React.useEffect(() => {
        if (!active) {
            return;
        }

        setStartedAtMs(getSharedProvisioningStatusStartedAtMs());
    }, [active]);

    return active
        ? (startedAtMs ?? getSharedProvisioningStatusStartedAtMs())
        : undefined;
}

function getSharedProvisioningStatusStartedAtMs(): number {
    if (sharedProvisioningStatusStartedAtMs == null) {
        sharedProvisioningStatusStartedAtMs = Date.now();
    }

    return sharedProvisioningStatusStartedAtMs;
}

export function HostedProvisioningHero({
    width,
    height,
    stages,
    statusStartedAtMs,
    fullBleed = false,
    showStatus = true,
    statusContainerStyle,
}: {
    width: number;
    height: number;
    stages: HostedProvisioningStatusStage[];
    statusStartedAtMs?: number;
    fullBleed?: boolean;
    showStatus?: boolean;
    statusContainerStyle?: ViewStyle;
}) {
    const sceneHeight = Math.max(250, height);

    return (
        <View
            style={{
                width,
                height: fullBleed ? sceneHeight : undefined,
                borderRadius: fullBleed ? 0 : 28,
                backgroundColor: palette.white,
                overflow: "hidden",
                borderWidth: fullBleed ? 0 : 1,
                borderColor: fullBleed
                    ? palette.transparent
                    : palette.thinPurple,
            }}
        >
            <View
                style={{
                    width,
                    height: sceneHeight,
                    backgroundColor: palette.white,
                }}
            >
                <Canvas style={{ width, height: sceneHeight }}>
                    <HostedProvisioningTimelineScene
                        width={width}
                        height={sceneHeight}
                    />
                </Canvas>
                <OrbitingProvisioningOrbs width={width} height={sceneHeight} />
            </View>
            {showStatus ? (
                <View
                    style={[
                        {
                            paddingHorizontal: 18,
                            paddingTop: 6,
                            paddingBottom: 18,
                            backgroundColor: palette.black,
                        },
                        fullBleed
                            ? {
                                  position: "absolute",
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  backgroundColor: "rgba(0,0,0,0.5)",
                              }
                            : null,
                        statusContainerStyle,
                    ]}
                >
                    <AnimatedProvisioningStatusText
                        stages={stages}
                        startedAtMs={statusStartedAtMs}
                    />
                </View>
            ) : null}
        </View>
    );
}

export function AnimatedProvisioningStatusText({
    stages,
    startedAtMs,
    compact = false,
    containerStyle,
    textStyle,
}: {
    stages: HostedProvisioningStatusStage[];
    startedAtMs?: number;
    compact?: boolean;
    containerStyle?: ViewStyle;
    textStyle?: TextStyle;
}) {
    const reducedMotion = useReducedMotion();
    const [stageIndex, setStageIndex] = React.useState(() =>
        getProvisioningStageIndex(stages, startedAtMs),
    );
    const opacity = useSharedValue(1);
    const translateY = useSharedValue(0);
    const currentStage = stages[stageIndex];
    const swapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const nextStageDelayMs = getProvisioningNextStageDelayMs(
        stages,
        stageIndex,
        startedAtMs,
    );

    React.useEffect(() => {
        setStageIndex(getProvisioningStageIndex(stages, startedAtMs));
        opacity.value = 1;
        translateY.value = 0;
    }, [opacity, stages, startedAtMs, translateY]);

    React.useEffect(() => {
        if (nextStageDelayMs == null) {
            return;
        }

        const transitionMs = reducedMotion ? 0 : 220;
        const stageTimer = setTimeout(() => {
            const nextStageIndex = startedAtMs
                ? getProvisioningStageIndex(stages, startedAtMs)
                : Math.min(stageIndex + 1, stages.length - 1);

            if (transitionMs === 0) {
                setStageIndex(nextStageIndex);
                return;
            }

            opacity.value = withTiming(0, {
                duration: transitionMs,
                easing: Easing.out(Easing.quad),
            });
            translateY.value = withTiming(compact ? -5 : -8, {
                duration: transitionMs,
                easing: Easing.out(Easing.quad),
            });

            swapTimerRef.current = setTimeout(() => {
                setStageIndex(nextStageIndex);
                translateY.value = compact ? 5 : 8;
                opacity.value = withTiming(1, {
                    duration: 280,
                    easing: Easing.out(Easing.cubic),
                });
                translateY.value = withTiming(0, {
                    duration: 280,
                    easing: Easing.out(Easing.cubic),
                });
            }, transitionMs);
        }, nextStageDelayMs);

        return () => {
            clearTimeout(stageTimer);
            if (swapTimerRef.current) {
                clearTimeout(swapTimerRef.current);
                swapTimerRef.current = null;
            }
        };
    }, [
        compact,
        nextStageDelayMs,
        opacity,
        reducedMotion,
        stageIndex,
        startedAtMs,
        stages,
        stages.length,
        translateY,
    ]);

    const animatedTextStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    if (!currentStage?.message) {
        return null;
    }

    return (
        <View
            accessible={true}
            accessibilityRole="text"
            style={[
                {
                    minHeight: compact ? 26 : 34,
                    justifyContent: "center",
                    alignItems: "center",
                },
                containerStyle,
            ]}
        >
            <Animated.Text
                style={[
                    ss.purpleText,
                    {
                        color: compact
                            ? palette.purple
                            : "rgba(246, 238, 255, 0.94)",
                        fontFamily: "JuraBold",
                        fontSize: compact ? 16 : 18,
                        lineHeight: compact ? 21 : 24,
                        letterSpacing: 0.3,
                        textAlign: "center",
                        textShadowColor: compact
                            ? "rgba(255, 255, 255, 0.65)"
                            : "rgba(126, 92, 184, 0.7)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: compact ? 6 : 12,
                    },
                    textStyle,
                    animatedTextStyle,
                ]}
            >
                {currentStage.message}
            </Animated.Text>
        </View>
    );
}

function getProvisioningStageIndex(
    stages: HostedProvisioningStatusStage[],
    startedAtMs?: number,
): number {
    if (!startedAtMs) {
        return 0;
    }

    let elapsedMs = Math.max(0, Date.now() - startedAtMs);
    for (let index = 0; index < stages.length; index++) {
        const durationMs = stages[index]?.durationMs;
        if (!durationMs || elapsedMs < durationMs) {
            return index;
        }
        elapsedMs -= durationMs;
    }

    return Math.max(0, stages.length - 1);
}

function getProvisioningNextStageDelayMs(
    stages: HostedProvisioningStatusStage[],
    stageIndex: number,
    startedAtMs?: number,
): number | null {
    const currentStage = stages[stageIndex];
    if (!currentStage?.durationMs || stageIndex >= stages.length - 1) {
        return null;
    }
    if (!startedAtMs) {
        return currentStage.durationMs;
    }

    const stageEndElapsedMs = stages
        .slice(0, stageIndex + 1)
        .reduce((sum, stage) => sum + (stage.durationMs ?? 0), 0);

    return Math.max(0, stageEndElapsedMs - (Date.now() - startedAtMs));
}

function OrbitingProvisioningOrbs({
    width,
    height,
}: {
    width: number;
    height: number;
}) {
    const reducedMotion = useReducedMotion();
    const orbit = useSharedValue(reducedMotion ? 0.12 : 0);
    const entryProgress = useSharedValue(reducedMotion ? 1 : 0);
    const sceneScale = Math.min(width, height);
    const orbBoxSize = Math.max(82, Math.min(118, sceneScale * 0.38));
    const centerX = width * 0.58;
    const centerY = height * 0.25;
    const orbitRadius = Math.max(22, Math.min(40, sceneScale * 0.12));

    React.useEffect(() => {
        cancelAnimation(orbit);
        cancelAnimation(entryProgress);

        if (reducedMotion) {
            orbit.value = 0.12;
            entryProgress.value = 1;
            return;
        }

        orbit.value = 0;
        entryProgress.value = 0;
        orbit.value = withRepeat(
            withTiming(1, {
                duration: ORBITING_ORBS_ORBIT_DURATION_MS,
                easing: Easing.linear,
            }),
            -1,
            false,
        );
        entryProgress.value = withDelay(
            ORBITING_ORBS_ENTRY_DELAY_MS,
            withTiming(1, {
                duration: ORBITING_ORBS_ENTRY_DURATION_MS,
                easing: Easing.linear,
            }),
        );

        return () => {
            cancelAnimation(orbit);
            cancelAnimation(entryProgress);
        };
    }, [entryProgress, orbit, reducedMotion]);

    const firstOrbStyle = useAnimatedStyle(() => {
        const entry = springyEase(entryProgress.value);
        const opacityProgress = entryProgress.value;
        const angle = orbit.value * TAU;
        const scale = interpolate(entry, [0, 1], [0.18, 1]);

        return {
            opacity: interpolate(opacityProgress, [0, 0.24, 1], [0, 0.72, 1]),
            transform: [
                {
                    translateX:
                        centerX -
                        orbBoxSize / 2 +
                        Math.cos(angle) * orbitRadius * entry,
                },
                {
                    translateY:
                        centerY -
                        orbBoxSize / 2 +
                        Math.sin(angle) * orbitRadius * 0.56 * entry +
                        (1 - entry) * height * 0.04,
                },
                { scale },
            ],
        };
    });
    const secondOrbStyle = useAnimatedStyle(() => {
        const entry = springyEase(entryProgress.value);
        const opacityProgress = entryProgress.value;
        const angle = orbit.value * TAU + Math.PI;
        const scale = interpolate(entry, [0, 1], [0.14, 1]);

        return {
            opacity: interpolate(opacityProgress, [0, 0.24, 1], [0, 0.72, 1]),
            transform: [
                {
                    translateX:
                        centerX -
                        orbBoxSize / 2 +
                        Math.cos(angle) * orbitRadius * entry,
                },
                {
                    translateY:
                        centerY -
                        orbBoxSize / 2 +
                        Math.sin(angle) * orbitRadius * 0.56 * entry +
                        (1 - entry) * height * 0.04,
                },
                { scale },
            ],
        };
    });

    return (
        <View
            pointerEvents="none"
            style={{
                position: "absolute",
                left: 0,
                top: 0,
                width,
                height,
            }}
        >
            <Animated.View
                style={[
                    {
                        position: "absolute",
                        width: orbBoxSize,
                        height: orbBoxSize,
                    },
                    firstOrbStyle,
                ]}
            >
                <OrbScene
                    width={orbBoxSize}
                    height={orbBoxSize}
                    evolutionLevel={0}
                    themeLevel={3}
                    orbRadiusScale={0.92}
                    maxVisibleOrbs={1}
                    orbModes={["announcing"]}
                    pressDisabled={true}
                    statusOpacity={0}
                />
            </Animated.View>
            <Animated.View
                style={[
                    {
                        position: "absolute",
                        width: orbBoxSize,
                        height: orbBoxSize,
                    },
                    secondOrbStyle,
                ]}
            >
                <OrbScene
                    width={orbBoxSize}
                    height={orbBoxSize}
                    evolutionLevel={0}
                    themeLevel={3}
                    orbRadiusScale={0.72}
                    maxVisibleOrbs={1}
                    orbModes={["announcing"]}
                    pressDisabled={true}
                    statusOpacity={0}
                />
            </Animated.View>
        </View>
    );
}

function HostedProvisioningTimelineScene({
    width,
    height,
}: {
    width: number;
    height: number;
}) {
    const reducedMotion = useReducedMotion();
    const timeline = useSharedValue(reducedMotion ? 28 : 0);

    React.useEffect(() => {
        cancelAnimation(timeline);

        if (reducedMotion) {
            timeline.value = 28;
            return;
        }

        timeline.value = 0;
        timeline.value = withTiming(SCENE_END_SECONDS, {
            duration: SCENE_END_SECONDS * 1000,
            easing: Easing.linear,
        });

        return () => {
            cancelAnimation(timeline);
        };
    }, [reducedMotion, timeline]);

    const backgroundColors = [
        "#0B58A4",
        PROVISIONING_SCENE_BACKGROUND_COLOR,
        "#7A74CD",
        "#FFFFFF",
        "#FFFFFF",
    ];
    return (
        <Group>
            <Rect x={0} y={0} width={width} height={height}>
                <LinearGradient
                    start={vec(width / 2, height)}
                    end={vec(width / 2, 0)}
                    colors={backgroundColors}
                    positions={[0, 0.44, 0.66, 0.84, 1]}
                />
            </Rect>

            <Circle
                cx={width * 0.5}
                cy={height * 0.5}
                r={Math.max(width, height) * 0.74}
                opacity={0.16}
            >
                <RadialGradient
                    c={vec(width * 0.5, height * 0.48)}
                    r={Math.max(width, height) * 0.72}
                    colors={["rgba(0,0,0,0)", "rgba(5,12,38,0.64)"]}
                    positions={[0.42, 1]}
                />
            </Circle>

            <IsometricLandscape
                width={width}
                height={height}
                timeline={timeline}
            />
        </Group>
    );
}

function IsometricLandscape({
    width,
    height,
    timeline,
}: {
    width: number;
    height: number;
    timeline: SharedValue<number>;
}) {
    const tileW = width * 0.105;
    const tileH = tileW * 0.44;
    const originX = width * 0.5;
    const originY = height * 0.58;
    const horizonY = height * 0.32;
    const tileFill = "rgba(255,255,255,0.16)";
    const alternateTileFill = "rgba(255,255,255,0.09)";
    const tileStroke = "rgba(255,238,230,0.44)";
    const floorPath = React.useMemo(() => {
        const topY = horizonY - tileH * 0.5;
        const shoulderY = height * 0.76;
        const bottomY = height + tileH * 4;

        return `M ${originX} ${topY} L ${width + tileW * 5.2} ${shoulderY} L ${width + tileW * 3.2} ${bottomY} L ${-tileW * 3.2} ${bottomY} L ${-tileW * 5.2} ${shoulderY} Z`;
    }, [height, horizonY, originX, tileH, tileW, width]);
    const cellSpecs = React.useMemo(() => {
        const renderedCells: {
            key: string;
            cx: number;
            cy: number;
            path: string;
            alt: boolean;
            opacity: number;
            strokeWidth: number;
            entryDelay: number;
            entryDuration: number;
            entryOffsetX: number;
            entryOffsetY: number;
        }[] = [];

        for (let row = -22; row <= 28; row++) {
            for (let col = -22; col <= 28; col++) {
                const cx = originX + ((col - row) * tileW) / 2;
                const cy = originY + ((col + row) * tileH) / 2;
                if (
                    cx < -tileW * 3.8 ||
                    cx > width + tileW * 3.8 ||
                    cy < horizonY ||
                    cy > height + tileH * 2.8
                ) {
                    continue;
                }

                const distance = Math.min(
                    1,
                    Math.max(0, (cy - horizonY) / (height - horizonY)),
                );
                const entryNoise = cellNoise(col, row, 3);
                const speedNoise = cellNoise(col, row, 4);

                renderedCells.push({
                    key: `${col}:${row}`,
                    cx,
                    cy,
                    path: diamondPath(cx, cy, tileW, tileH),
                    alt: Math.abs(col + row) % 2 === 0,
                    opacity: 0.08 + distance * 0.92,
                    strokeWidth: 0.6 + distance * 0.55,
                    entryDelay: 0.02 + entryNoise * 0.5 + distance * 0.2,
                    entryDuration: 0.9 + speedNoise * 0.9,
                    entryOffsetX: (cellNoise(col, row, 5) - 0.5) * tileW * 1.2,
                    entryOffsetY:
                        height * 0.12 +
                        (cellNoise(col, row, 6) - 0.5) * tileH * 2.8,
                });
            }
        }
        return renderedCells.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    }, [height, horizonY, originX, originY, tileH, tileW, width]);

    return (
        <Group>
            <Path path={floorPath}>
                <LinearGradient
                    start={vec(width * 0.5, horizonY)}
                    end={vec(width * 0.5, height)}
                    colors={[
                        "rgba(35,70,126,0.08)",
                        "rgba(84,86,155,0.24)",
                        "rgba(48,54,107,0.46)",
                    ]}
                    positions={[0, 0.58, 1]}
                />
            </Path>
            {cellSpecs.map((cell) => (
                <IsometricCell
                    key={cell.key}
                    cell={cell}
                    tileFill={cell.alt ? tileFill : alternateTileFill}
                    tileStroke={tileStroke}
                    timeline={timeline}
                />
            ))}
        </Group>
    );
}

function IsometricCell({
    cell,
    tileFill,
    tileStroke,
    timeline,
}: {
    cell: {
        cx: number;
        cy: number;
        path: string;
        opacity: number;
        strokeWidth: number;
        entryDelay: number;
        entryDuration: number;
        entryOffsetX: number;
        entryOffsetY: number;
    };
    tileFill: string;
    tileStroke: string;
    timeline: SharedValue<number>;
}) {
    const cellProgress = useDerivedValue(() => {
        const rawProgress = interpolate(
            timeline.value,
            [cell.entryDelay, cell.entryDelay + cell.entryDuration],
            [0, 1],
            Extrapolation.CLAMP,
        );

        return springyEase(rawProgress);
    });
    const transform = useDerivedValue(() => [
        { translateX: (1 - cellProgress.value) * cell.entryOffsetX },
        { translateY: (1 - cellProgress.value) * cell.entryOffsetY },
    ]);
    const opacity = useDerivedValue(() => cellProgress.value * cell.opacity);

    return (
        <Group opacity={opacity} transform={transform}>
            <Path path={cell.path} color={tileFill} />
            <Path
                path={cell.path}
                style="stroke"
                strokeWidth={cell.strokeWidth}
                color={tileStroke}
            />
        </Group>
    );
}

function diamondPath(
    cx: number,
    cy: number,
    width: number,
    height: number,
): string {
    return `M ${cx} ${cy - height / 2} L ${cx + width / 2} ${cy} L ${cx} ${cy + height / 2} L ${cx - width / 2} ${cy} Z`;
}

function cellNoise(col: number, row: number, salt = 0): number {
    const value = Math.sin(col * 12.9898 + row * 78.233 + salt * 37.719);

    return value * 43758.5453 - Math.floor(value * 43758.5453);
}

function springyEase(progress: number): number {
    "worklet";

    const clampedProgress = Math.max(0, Math.min(1, progress));
    const overshoot = 1.36;

    return (
        1 +
        (overshoot + 1) * (clampedProgress - 1) ** 3 +
        overshoot * (clampedProgress - 1) ** 2
    );
}

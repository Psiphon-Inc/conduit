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
    Shadow,
    interpolateColors,
    vec,
} from "@shopify/react-native-skia";
import React from "react";
import { useTranslation } from "react-i18next";
import { I18nManager, Text, View } from "react-native";
import {
    Easing,
    cancelAnimation,
    useDerivedValue,
    useSharedValue,
    withDelay,
    withRepeat,
    withSpring,
    withTiming,
} from "react-native-reanimated";

import { ConduitConnectionLight } from "@/src/components/canvas/ConduitConnectionLight";
import { palette, sharedStyles as ss } from "@/src/styles";

const MAX_HOSTED_LIGHTS = 8;

export function HostedMiniOrb({
    label,
    connectedCount,
    connectingCount,
    width,
    height,
    applyBlur = false,
    showDetails = true,
}: {
    label: string;
    connectedCount: number;
    connectingCount: number;
    width: number;
    height: number;
    applyBlur?: boolean;
    showDetails?: boolean;
}) {
    const { t } = useTranslation();
    const orbColors = [
        palette.deepMauve,
        palette.peach,
        palette.fadedMauve,
        palette.mauve,
        palette.fadedMauve,
    ];
    const orbColorsIndex = useSharedValue(0);
    const orbGradientColors = useDerivedValue(() => [
        palette.white,
        interpolateColors(orbColorsIndex.value, [0, 1, 2, 3, 4], orbColors),
    ]);

    const orbRadius = useSharedValue(0);
    const finalOrbRadius = width / 4;
    const orbCenterY = height / 2;

    const orbCenteringTransform = [
        { translateY: orbCenterY },
        { translateX: width / 2 },
    ];

    const orbOverlayTransform = [
        { translateY: orbCenterY },
        { translateX: I18nManager.isRTL ? (-1 * width) / 2 : width / 2 },
    ];

    const isActive = connectedCount > 0;
    const isConnecting = connectingCount > 0;

    React.useEffect(() => {
        orbRadius.value = withDelay(
            80,
            withSpring(finalOrbRadius, {
                mass: 1.2,
                damping: 10,
                stiffness: 100,
                restDisplacementThreshold: 0.01,
                restSpeedThreshold: 2,
            }),
        );
    }, [finalOrbRadius, orbRadius]);

    React.useEffect(() => {
        if (isActive || isConnecting) {
            orbColorsIndex.value = withRepeat(
                withTiming(3, {
                    duration: isActive ? 2200 : 3200,
                    easing: Easing.linear,
                }),
                -1,
                true,
            );
            return;
        }
        cancelAnimation(orbColorsIndex);
        orbColorsIndex.value = withTiming(0, { duration: 500 });
    }, [isActive, isConnecting, orbColorsIndex]);

    const morphLayer = React.useMemo(() => {
        return (
            <Paint>
                <Blur blur={5} />
                <ColorMatrix
                    matrix={[
                        1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 5,
                        -2,
                    ]}
                />
            </Paint>
        );
    }, []);

    const clampedLights = Math.max(
        0,
        Math.min(MAX_HOSTED_LIGHTS, connectedCount),
    );

    return (
        <View
            style={{
                width,
                height,
                backgroundColor: "transparent",
            }}
        >
            <Canvas style={[ss.flex]}>
                <Group layer={<Paint>{applyBlur && <Blur blur={5} />}</Paint>}>
                    <Group transform={orbCenteringTransform}>
                        <Group layer={morphLayer}>
                            <Group>
                                <Circle r={orbRadius}>
                                    <Shadow
                                        dx={10}
                                        dy={10}
                                        blur={10}
                                        color={palette.mauve}
                                        inner
                                    />
                                    <Shadow
                                        dx={-10}
                                        dy={-10}
                                        blur={10}
                                        color={
                                            isActive || isConnecting
                                                ? palette.peach
                                                : palette.peachyMauve
                                        }
                                        inner
                                    />
                                    <RadialGradient
                                        c={vec(0, 0)}
                                        r={finalOrbRadius}
                                        colors={orbGradientColors}
                                    />
                                </Circle>
                                <Circle
                                    r={finalOrbRadius}
                                    style="stroke"
                                    strokeWidth={2}
                                    color={palette.deepMauve}
                                />
                            </Group>
                            {[...Array(MAX_HOSTED_LIGHTS).keys()].map((i) => (
                                <ConduitConnectionLight
                                    key={i}
                                    active={clampedLights > i}
                                    canvasWidth={width}
                                    orbRadius={finalOrbRadius}
                                    midPoint={vec(0, 0)}
                                    secondLastPoint={vec(0, -finalOrbRadius)}
                                    endPoint={vec(0, -(orbCenterY * 1.35))}
                                    randomize={true}
                                />
                            ))}
                        </Group>
                    </Group>
                </Group>
            </Canvas>
            {showDetails ? (
                <View
                    style={[
                        ss.absolute,
                        {
                            transform: orbOverlayTransform,
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

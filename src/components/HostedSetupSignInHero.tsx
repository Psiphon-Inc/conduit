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
    LinearGradient,
    RadialGradient,
    Rect,
    Shadow,
    interpolateColors,
    vec,
} from "@shopify/react-native-skia";
import React from "react";
import { Text, View } from "react-native";
import {
    Easing,
    useDerivedValue,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated";

import { palette, sharedStyles as ss } from "@/src/styles";

export function HostedSetupSignInHero({
    headline,
    body,
    width,
}: {
    headline: string;
    body: string;
    width: number;
}) {
    const pulse = useSharedValue(0);

    React.useEffect(() => {
        pulse.value = withRepeat(
            withTiming(1, {
                duration: 7000,
                easing: Easing.inOut(Easing.sin),
            }),
            -1,
            true,
        );
    }, [pulse]);

    const bandColors = React.useMemo(
        () => [
            "rgba(219,211,236,0)",
            "rgba(187,174,227,0.18)",
            "rgba(161,143,212,0.42)",
            "rgba(136, 99, 189, 1)",
            "rgba(136, 99, 189, 1)",
            "rgba(161,143,212,0.42)",
            "rgba(187,174,227,0.18)",
            "rgba(219,211,236,0)",
        ],
        [],
    );
    const bandPositions = React.useMemo(
        () => [0, 0.16, 0.25, 0.4, 0.6, 0.75, 0.84, 1],
        [],
    );

    const orbGradientColors = useDerivedValue(() => [
        interpolateColors(pulse.value, [0, 1], ["#8E77C3", "#9C85CD"]),
        interpolateColors(pulse.value, [0, 1], ["#EFA48D", "#F2B09A"]),
    ]);
    const orbGlowShadowColor = useDerivedValue(() =>
        interpolateColors(
            pulse.value,
            [0, 1],
            ["rgba(255,255,255,0.5)", "rgba(255,255,255,0.68)"],
        ),
    );
    const orbInnerShadowColor = useDerivedValue(() =>
        interpolateColors(
            pulse.value,
            [0, 1],
            ["rgba(246,198,185,0.72)", "rgba(234,182,168,0.88)"],
        ),
    );
    const orbInnerShadowGradient = useDerivedValue(() => [
        "rgba(246,255,255,0)",
        orbInnerShadowColor.value,
    ]);

    const cardHeight = Math.max(420, Math.min(500, width * 1.18));
    const bandHeight = Math.max(240, Math.min(300, width * 0.62));
    const orbRadius = Math.max(68, Math.min(94, width * 0.2));
    const orbCenterY = bandHeight * 0.47;
    const cardPadding = Math.max(14, Math.min(22, width * 0.05));
    const bodyFontSize = Math.max(13, Math.min(16, width * 0.04));
    const titleFontSize = Math.max(18, Math.min(26, width * 0.062));

    return (
        <View
            style={{
                width: "100%",
                minHeight: cardHeight,
                borderRadius: 28,
                backgroundColor: palette.white,
                overflow: "hidden",
            }}
        >
            <View
                style={{
                    paddingTop: cardPadding + 8,
                    paddingHorizontal: cardPadding,
                    paddingBottom: cardPadding,
                }}
            >
                <Text
                    style={[
                        ss.blackText,
                        ss.centeredText,
                        {
                            fontSize: titleFontSize,
                            fontFamily: ss.bodyFont.fontFamily,
                            lineHeight: titleFontSize * 1.22,
                            letterSpacing: 0.4,
                        },
                    ]}
                >
                    {headline}
                </Text>
            </View>

            <View style={{ width: "100%", height: bandHeight }}>
                <Canvas style={{ flex: 1 }}>
                    <Rect x={0} y={0} width={width} height={bandHeight}>
                        <LinearGradient
                            start={vec(width / 2, 0)}
                            end={vec(width / 2, bandHeight)}
                            colors={bandColors}
                            positions={bandPositions}
                        />
                    </Rect>
                    <Circle
                        cx={width / 2}
                        cy={orbCenterY + bandHeight * 0.02}
                        r={width * 0.52}
                    >
                        <RadialGradient
                            c={vec(width / 2, orbCenterY + bandHeight * 0.02)}
                            r={width * 0.42}
                            colors={[
                                "rgba(143,123,197,0.28)",
                                "rgba(143,123,197,0)",
                            ]}
                        />
                    </Circle>
                    <Circle cx={width / 2} cy={orbCenterY} r={orbRadius}>
                        <Shadow
                            dx={0}
                            dy={0}
                            blur={14}
                            color={orbGlowShadowColor}
                        />
                        <RadialGradient
                            c={vec(width / 2, orbCenterY)}
                            r={orbRadius}
                            colors={orbGradientColors}
                            positions={[0.4, 1]}
                        />
                    </Circle>
                    <Circle cx={width / 2} cy={orbCenterY} r={orbRadius}>
                        <RadialGradient
                            c={vec(
                                width / 2 - orbRadius * 0.13,
                                orbCenterY - orbRadius * 0.13,
                            )}
                            r={orbRadius * 1.45}
                            colors={orbInnerShadowGradient}
                            positions={[0.66, 1]}
                        />
                    </Circle>
                </Canvas>
            </View>

            <View
                style={{
                    paddingHorizontal: cardPadding,
                    paddingTop: cardPadding,
                    paddingBottom: cardPadding + 8,
                }}
            >
                <Text
                    style={[
                        ss.blackText,
                        {
                            fontSize: bodyFontSize,
                            fontFamily: ss.tinyFont.fontFamily,
                            lineHeight: bodyFontSize * 1.35,
                            letterSpacing: 0.2,
                        },
                    ]}
                >
                    {body}
                </Text>
            </View>
        </View>
    );
}

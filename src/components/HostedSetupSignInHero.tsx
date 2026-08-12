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
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { palette, sharedStyles as ss } from "@/src/styles";

const BAND_COLORS = [
    "rgba(219,211,236,0)",
    "rgba(187,174,227,0.18)",
    "rgba(161,143,212,0.42)",
    "rgba(136, 99, 189, 1)",
    "rgba(136, 99, 189, 1)",
    "rgba(161,143,212,0.42)",
    "rgba(187,174,227,0.18)",
    "rgba(219,211,236,0)",
] as const;
const BAND_POSITIONS = [0, 0.16, 0.25, 0.4, 0.6, 0.75, 0.84, 1] as const;

// The Skia hero pulsed its colors with interpolateColors over a 7s sine;
// the native version renders both pulse endpoints as static layers and
// crossfades the top one.
const PULSE_VARIANTS = [
    {
        gradient: ["#8E77C3", "#EFA48D"],
        glowAlpha: 0.5,
        innerShadow: "rgba(246,198,185,0.72)",
    },
    {
        gradient: ["#9C85CD", "#F2B09A"],
        glowAlpha: 0.68,
        innerShadow: "rgba(234,182,168,0.88)",
    },
];

function HeroOrbLayer({
    variant,
    idSuffix,
    orbRadius,
}: {
    variant: (typeof PULSE_VARIANTS)[number];
    idSuffix: string;
    orbRadius: number;
}) {
    // Box is 3x the orb radius so the soft white glow (formerly a Skia
    // Shadow blur) fits around the body.
    const box = orbRadius * 3;
    const center = box / 2;
    return (
        <Svg width={box} height={box} style={StyleSheet.absoluteFillObject}>
            <Defs>
                <RadialGradient
                    id={`hero-glow-${idSuffix}`}
                    cx="50%"
                    cy="50%"
                    r="50%"
                >
                    <Stop
                        offset={orbRadius / (box / 2) - 0.05}
                        stopColor="#FFFFFF"
                        stopOpacity={variant.glowAlpha}
                    />
                    <Stop offset={1} stopColor="#FFFFFF" stopOpacity={0} />
                </RadialGradient>
                <RadialGradient
                    id={`hero-body-${idSuffix}`}
                    cx="50%"
                    cy="50%"
                    r="50%"
                >
                    <Stop offset={0.4} stopColor={variant.gradient[0]} />
                    <Stop offset={1} stopColor={variant.gradient[1]} />
                </RadialGradient>
                <RadialGradient
                    id={`hero-shadow-${idSuffix}`}
                    cx="43.5%"
                    cy="43.5%"
                    r="72.5%"
                >
                    <Stop
                        offset={0.66}
                        stopColor="rgba(246,255,255,1)"
                        stopOpacity={0}
                    />
                    <Stop offset={1} stopColor={variant.innerShadow} />
                </RadialGradient>
            </Defs>
            <Circle
                cx={center}
                cy={center}
                r={box / 2}
                fill={`url(#hero-glow-${idSuffix})`}
            />
            <Circle
                cx={center}
                cy={center}
                r={orbRadius}
                fill={`url(#hero-body-${idSuffix})`}
            />
            <Circle
                cx={center}
                cy={center}
                r={orbRadius}
                fill={`url(#hero-shadow-${idSuffix})`}
            />
        </Svg>
    );
}

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

    const pulseStyle = useAnimatedStyle(
        () => ({ opacity: pulse.value }),
        [pulse],
    );

    const cardHeight = Math.max(420, Math.min(500, width * 1.18));
    const bandHeight = Math.max(240, Math.min(300, width * 0.62));
    const orbRadius = Math.max(68, Math.min(94, width * 0.2));
    const orbCenterY = bandHeight * 0.47;
    const cardPadding = Math.max(14, Math.min(22, width * 0.05));
    const bodyFontSize = Math.max(13, Math.min(16, width * 0.04));
    const titleFontSize = Math.max(18, Math.min(26, width * 0.062));
    const haloRadius = width * 0.52;
    const orbBox = orbRadius * 3;

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

            <View
                style={{
                    width: "100%",
                    height: bandHeight,
                    overflow: "hidden",
                }}
            >
                <LinearGradient
                    style={StyleSheet.absoluteFillObject}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    colors={BAND_COLORS}
                    locations={BAND_POSITIONS}
                />
                <Svg
                    width={haloRadius * 2}
                    height={haloRadius * 2}
                    style={{
                        position: "absolute",
                        left: width / 2 - haloRadius,
                        top: orbCenterY + bandHeight * 0.02 - haloRadius,
                    }}
                >
                    <Defs>
                        <RadialGradient
                            id="hero-halo"
                            cx="50%"
                            cy="50%"
                            r="50%"
                        >
                            <Stop
                                offset={0}
                                stopColor="rgb(143,123,197)"
                                stopOpacity={0.28}
                            />
                            <Stop
                                offset={0.42 / 0.52}
                                stopColor="rgb(143,123,197)"
                                stopOpacity={0}
                            />
                            <Stop
                                offset={1}
                                stopColor="rgb(143,123,197)"
                                stopOpacity={0}
                            />
                        </RadialGradient>
                    </Defs>
                    <Circle
                        cx={haloRadius}
                        cy={haloRadius}
                        r={haloRadius}
                        fill="url(#hero-halo)"
                    />
                </Svg>
                <View
                    style={{
                        position: "absolute",
                        left: width / 2 - orbBox / 2,
                        top: orbCenterY - orbBox / 2,
                        width: orbBox,
                        height: orbBox,
                    }}
                >
                    <HeroOrbLayer
                        variant={PULSE_VARIANTS[0]}
                        idSuffix="rest"
                        orbRadius={orbRadius}
                    />
                    <Animated.View
                        style={[StyleSheet.absoluteFillObject, pulseStyle]}
                    >
                        <HeroOrbLayer
                            variant={PULSE_VARIANTS[1]}
                            idSuffix="peak"
                            orbRadius={orbRadius}
                        />
                    </Animated.View>
                </View>
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

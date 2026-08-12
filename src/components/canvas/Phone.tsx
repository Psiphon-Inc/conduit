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
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
    Easing,
    SharedValue,
    cancelAnimation,
    useAnimatedReaction,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withTiming,
} from "react-native-reanimated";
import Svg, {
    Defs,
    Path,
    Stop,
    LinearGradient as SvgLinearGradient,
} from "react-native-svg";

import { NativeConnectionLight } from "@/src/components/orb-scene/native/NativeConnectionLight";
import { palette } from "@/src/styles";

// Phone frame outline in a 50x85 box, extracted verbatim from the former
// Skia implementation.
const PHONE_FRAME_PATH =
    "M50.3506 5.38172V80.5817C50.3506 80.5817 50.2606 80.6617 50.2506 80.7117C49.5006 84.3017 47.4806 85.9517 43.8106 85.9517C31.4406 85.9517 19.0706 85.9517 6.70057 85.9517C2.91057 85.9517 0.440558 83.5117 0.440558 79.7217C0.440558 55.2217 0.430578 30.7317 0.460578 6.23172C0.460578 5.20172 0.740549 4.11172 1.15055 3.17172C1.95055 1.35172 3.57058 0.481719 5.43058 0.0117188H45.3206C46.8506 0.421719 48.3006 1.02172 49.1406 2.43172C49.6806 3.33172 49.9506 4.39172 50.3506 5.38172ZM46.2106 75.1917V9.28172H4.52058V75.1817H46.2106V75.1917ZM22.5006 80.1017C22.4806 81.7017 23.7206 83.0017 25.3106 83.0517C26.8706 83.1017 28.2106 81.8117 28.2406 80.2317C28.2706 78.5917 27.0006 77.2617 25.3906 77.2517C23.8106 77.2417 22.5106 78.5217 22.5006 80.1117V80.1017ZM25.3706 4.20172C23.4506 4.20172 21.5206 4.20172 19.6006 4.20172C19.0806 4.20172 18.5906 4.27172 18.5906 4.90172C18.5906 5.55172 19.1106 5.59172 19.6106 5.59172C23.4606 5.59172 27.3005 5.59172 31.1505 5.59172C31.6605 5.59172 32.1706 5.54172 32.1606 4.89172C32.1606 4.25172 31.6506 4.19172 31.1406 4.20172C29.2206 4.20172 27.2906 4.20172 25.3706 4.20172Z";

const PHONE_VIEW_WIDTH = 50;
const PHONE_VIEW_HEIGHT = 85;

interface PhoneProps {
    currentView: SharedValue<number>;
    sceneWidth: number;
    sceneHeight: number;
}

/**
 * The onboarding phone: a noise-tile "TV static" screen behind an SVG frame,
 * flanked by gradient bands, with a native connection light flying from the
 * phone into the orb. The Skia Turbulence static becomes a steps-eased
 * crossfade between two pre-baked seeded noise tiles.
 */
export function Phone({ currentView, sceneWidth, sceneHeight }: PhoneProps) {
    const phoneDestWidth = sceneWidth * 0.1;
    const phoneDestHeight =
        (phoneDestWidth / PHONE_VIEW_WIDTH) * PHONE_VIEW_HEIGHT;
    const phoneScale = phoneDestWidth / PHONE_VIEW_WIDTH;

    const phoneOpacity = useSharedValue(0);
    const noiseFlicker = useSharedValue(0);

    useAnimatedReaction(
        () => {
            return currentView.value;
        },
        (current, previous) => {
            if (previous === 1) {
                cancelAnimation(noiseFlicker);
            }
            if (current === 0) {
                phoneOpacity.value = withTiming(0);
                noiseFlicker.value = 0;
            } else if (current === 1) {
                phoneOpacity.value = withDelay(
                    previous === 0 ? 1400 : 0,
                    withTiming(1, { duration: 800 }),
                );
                noiseFlicker.value = withRepeat(
                    withTiming(1, {
                        duration: 1000,
                        easing: Easing.steps(5),
                    }),
                    -1,
                    true,
                );
            } else if (current >= 2) {
                phoneOpacity.value = withTiming(0, { duration: 500 });
            }
        },
    );

    const phoneOpacityStyle = useAnimatedStyle(
        () => ({ opacity: phoneOpacity.value }),
        [phoneOpacity],
    );
    const noiseBStyle = useAnimatedStyle(
        () => ({ opacity: noiseFlicker.value }),
        [noiseFlicker],
    );

    return (
        <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, phoneOpacityStyle]}
        >
            {/* Gradient bands behind the connection light's flight path. */}
            <LinearGradient
                style={{
                    position: "absolute",
                    left: phoneDestWidth * 1.5,
                    top: 0,
                    width: sceneWidth * 0.1,
                    height: sceneHeight,
                }}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                colors={[palette.white, palette.deepMauve]}
            />
            <LinearGradient
                style={{
                    position: "absolute",
                    left: sceneWidth * 0.8,
                    top: 0,
                    width: sceneWidth * 0.2,
                    height: sceneHeight,
                }}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                colors={[palette.white, palette.peach]}
            />

            <View
                style={{
                    position: "absolute",
                    left: sceneWidth * 0.05,
                    top: sceneHeight / 3,
                    width: phoneDestWidth,
                    height: phoneDestHeight,
                }}
            >
                {/* Screen static behind the frame. */}
                <View
                    style={{
                        position: "absolute",
                        left: 2 * phoneScale,
                        top: 0,
                        width: 48 * phoneScale,
                        height: 85 * phoneScale,
                        borderRadius: 5 * phoneScale,
                        overflow: "hidden",
                    }}
                >
                    <ExpoImage
                        source={require("@/assets/images/generated/noise-tile-a.png")}
                        style={StyleSheet.absoluteFillObject}
                        contentFit="fill"
                    />
                    <Animated.View
                        style={[StyleSheet.absoluteFillObject, noiseBStyle]}
                    >
                        <ExpoImage
                            source={require("@/assets/images/generated/noise-tile-b.png")}
                            style={StyleSheet.absoluteFillObject}
                            contentFit="fill"
                        />
                    </Animated.View>
                </View>
                <Svg
                    width={phoneDestWidth}
                    height={phoneDestHeight}
                    viewBox={`0 0 ${PHONE_VIEW_WIDTH} ${PHONE_VIEW_HEIGHT}`}
                >
                    <Defs>
                        <SvgLinearGradient
                            id="phone-frame-gradient"
                            x1="25"
                            y1="86"
                            x2="25"
                            y2="0"
                            gradientUnits="userSpaceOnUse"
                        >
                            <Stop offset={0} stopColor={palette.purple} />
                            <Stop offset={1} stopColor={palette.mauve} />
                        </SvgLinearGradient>
                    </Defs>
                    <Path
                        d={PHONE_FRAME_PATH}
                        fill="url(#phone-frame-gradient)"
                    />
                </Svg>
            </View>

            {/* Light flying from the phone through the orb and onward. */}
            <View
                style={{
                    position: "absolute",
                    left: sceneWidth / 2,
                    top: sceneHeight / 2,
                    width: 0,
                    height: 0,
                }}
            >
                <NativeConnectionLight
                    active={true}
                    orbRadius={sceneHeight / 3}
                    midPoint={{ x: 0, y: 0 }}
                    secondLastPoint={{ x: sceneWidth / 4, y: 0 }}
                    endPoint={{ x: sceneWidth / 2 - 25, y: 0 }}
                    randomize={false}
                    x0init={-sceneWidth / 2}
                    y0init={0}
                />
            </View>

            <ExpoImage
                source={require("@/assets/images/psiphon-logo.png")}
                style={{
                    position: "absolute",
                    left: sceneWidth - 50,
                    top: sceneHeight / 2 - 20,
                    width: 40,
                    height: 40,
                }}
                contentFit="contain"
            />
        </Animated.View>
    );
}

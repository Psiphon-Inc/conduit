/*
 * Copyright (c) 2025, Psiphon Inc.
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
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
    SharedValue,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInproxyStatus } from "@/src/inproxy/hooks";
import { palette } from "@/src/styles";

export type SkyBoxGradientState = 0 | 1 | 2 | 3;

// Bottom-to-top color stops per state. Rendered as four static gradient
// layers whose opacities crossfade with the fractional gradient state:
// animating layer opacity stays on the compositor, where continuously
// re-interpolating gradient color arrays (the old Skia approach) re-rasterized
// every frame.
const SKYBOX_GRADIENT_STATES: [string, string, string][] = [
    [palette.mauve, palette.fadedMauve, palette.white],
    [palette.peach, palette.mauve, palette.fadedMauve],
    ["#F59F86", "#BB89AD", "#B3D4FF"],
    ["#F59F86", "#BB89AD", "#9C81C9"],
];

export function SkyBox({
    gradientState = 0,
}: {
    gradientState?: SkyBoxGradientState;
}) {
    const frame = useWindowDimensions();

    const width = frame.width;
    const height = frame.height;

    return (
        <View
            style={[
                {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: width,
                    height: height,
                    backgroundColor: "transparent",
                },
            ]}
        >
            <InproxyStatusColorCanvas
                width={width}
                height={height}
                gradientState={gradientState}
            />
        </View>
    );
}

function SkyBoxGradientLayer({
    index,
    fader,
    colors,
}: {
    index: number;
    fader: SharedValue<number>;
    colors: [string, string, string];
}) {
    const layerStyle = useAnimatedStyle(() => {
        // The bottom layer stays opaque; each higher layer fades in over the
        // one below as the state passes it, so mid-transition compositing
        // never drops below full coverage.
        const opacity =
            index === 0
                ? 1
                : Math.min(1, Math.max(0, fader.value - (index - 1)));
        return { opacity };
    }, [fader, index]);

    return (
        <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, layerStyle]}
        >
            <LinearGradient
                // The Skia gradient ran bottom -> top; expo-linear-gradient
                // colors run start -> end, so start at the bottom edge.
                colors={colors}
                start={{ x: 0.5, y: 1 }}
                end={{ x: 0.5, y: 0 }}
                style={StyleSheet.absoluteFillObject}
            />
        </Animated.View>
    );
}

export function InproxyStatusColorCanvas({
    width,
    height,
    faderInitial,
    gradientState,
}: {
    width: number;
    height: number;
    faderInitial?: number;
    gradientState?: SkyBoxGradientState;
}) {
    const insets = useSafeAreaInsets();
    const { data: inproxyStatus } = useInproxyStatus();

    const initialValue = React.useMemo(() => {
        if (typeof gradientState === "number") {
            return gradientState;
        }
        if (typeof faderInitial === "number") {
            return faderInitial;
        }
        return 0;
    }, [faderInitial, gradientState]);
    const fader = useSharedValue(initialValue);

    const targetGradientState: SkyBoxGradientState = React.useMemo(() => {
        if (typeof gradientState === "number") {
            return gradientState;
        }
        return inproxyStatus === "RUNNING" ? 1 : 0;
    }, [gradientState, inproxyStatus]);

    React.useEffect(() => {
        fader.value = withTiming(targetGradientState, { duration: 900 });
    }, [fader, targetGradientState]);

    return (
        <View
            style={[
                {
                    position: "absolute",
                    top: 0,
                    width: width,
                    height: height,
                },
            ]}
        >
            {SKYBOX_GRADIENT_STATES.map((colors, index) => (
                <SkyBoxGradientLayer
                    key={`skybox-layer-${index}`}
                    index={index}
                    fader={fader}
                    colors={colors}
                />
            ))}
            <View
                style={{
                    position: "absolute",
                    bottom: 0,
                    width: "100%",
                    height: insets.bottom,
                    backgroundColor: palette.black,
                }}
            />
        </View>
    );
}

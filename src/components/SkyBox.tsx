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
import {
    Canvas,
    LinearGradient,
    Rect,
    interpolateColors,
    vec,
} from "@shopify/react-native-skia";
import React from "react";
import { View, useWindowDimensions } from "react-native";
import {
    useDerivedValue,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInproxyStatus } from "@/src/inproxy/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

export type SkyBoxGradientState = 0 | 1 | 2 | 3;

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

    const gradientStates = [
        {
            start: palette.mauve,
            middle: palette.fadedMauve,
            end: palette.white,
        },
        {
            start: palette.peach,
            middle: palette.mauve,
            end: palette.fadedMauve,
        },
        {
            start: "#F59F86",
            middle: "#BB89AD",
            end: "#B3D4FF",
        },
        {
            start: "#F59F86",
            middle: "#BB89AD",
            end: "#9C81C9",
        },
    ];

    const backgroundGradientColors = useDerivedValue(() => {
        return [
            interpolateColors(
                fader.value,
                [0, 1, 2, 3],
                [
                    gradientStates[0].start,
                    gradientStates[1].start,
                    gradientStates[2].start,
                    gradientStates[3].start,
                ],
            ),
            interpolateColors(
                fader.value,
                [0, 1, 2, 3],
                [
                    gradientStates[0].middle,
                    gradientStates[1].middle,
                    gradientStates[2].middle,
                    gradientStates[3].middle,
                ],
            ),
            interpolateColors(
                fader.value,
                [0, 1, 2, 3],
                [
                    gradientStates[0].end,
                    gradientStates[1].end,
                    gradientStates[2].end,
                    gradientStates[3].end,
                ],
            ),
        ];
    });

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
            <Canvas style={[ss.flex]}>
                <Rect x={0} y={0} width={width} height={height}>
                    <LinearGradient
                        start={vec(width / 2, height)}
                        end={vec(width / 2, 0)}
                        colors={backgroundGradientColors}
                    />
                </Rect>
            </Canvas>
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

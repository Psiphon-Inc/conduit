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
    withDelay,
    withTiming,
} from "react-native-reanimated";

import { useInproxyStatus } from "@/src/inproxy/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

export function SkyBox() {
    const win = useWindowDimensions();

    const width = win.width;
    const height = win.height;

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
            <InproxyStatusColorCanvas width={width} height={height} />
        </View>
    );
}

export function InproxyStatusColorCanvas({
    width,
    height,
}: {
    width: number;
    height: number;
}) {
    const { data: inproxyStatus } = useInproxyStatus();

    const fadeIn = useSharedValue(0);
    const fader = useSharedValue(0);
    const shouldAnimateIn = React.useRef(true);
    const shouldAnimateOut = React.useRef(true);

    React.useEffect(() => {
        if (inproxyStatus !== "UNKNOWN") {
            fadeIn.value = withDelay(0, withTiming(1, { duration: 2000 }));
        }
        if (inproxyStatus === "RUNNING") {
            if (shouldAnimateIn.current) {
                fader.value = withTiming(1, { duration: 1000 });
                shouldAnimateIn.current = false;
                shouldAnimateOut.current = true;
            }
        } else if (inproxyStatus === "STOPPED") {
            if (shouldAnimateOut.current) {
                fader.value = withTiming(0, { duration: 1000 });
                shouldAnimateIn.current = true;
                shouldAnimateOut.current = false;
            }
        }
    }, [inproxyStatus]);

    // make gradient taller with fader
    const gradientPairs = [
        [palette.white, palette.white],
        [palette.white, palette.white],
        [palette.fadedMauve, palette.mauve],
        [palette.mauve, palette.peach],
    ];
    const backgroundGradientColors = useDerivedValue(() => {
        return [
            interpolateColors(fader.value, [0, 1], gradientPairs[0]),
            interpolateColors(fader.value, [0, 1], gradientPairs[1]),
            interpolateColors(fader.value, [0, 1], gradientPairs[2]),
            interpolateColors(fader.value, [0, 1], gradientPairs[3]),
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
                        start={vec(width / 2, 0)}
                        end={vec(width / 2, height)}
                        colors={backgroundGradientColors}
                    />
                </Rect>
            </Canvas>
        </View>
    );
}

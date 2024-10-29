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


import {
    Canvas,
    Group,
    ImageSVG,
    fitbox,
    rect,
    useSVG,
} from "@shopify/react-native-skia";
import React from "react";
import { View } from "react-native";
import { useSharedValue, withDelay, withTiming } from "react-native-reanimated";

import { FaderGroup } from "@/src/components/canvas/FaderGroup";
import { PARTICLE_VIDEO_DELAY_MS } from "@/src/constants";
import { useInproxyStatus } from "@/src/inproxy/hooks";
import { sharedStyles as ss } from "@/src/styles";

export function LogoWordmark({
    width,
    height,
}: {
    width: number;
    height: number;
}) {
    const { data: inproxyStatus } = useInproxyStatus();

    const conduitWordMarkSvg = useSVG(
        require("@/assets/images/psiphon-conduit-wordmark.svg"),
    );
    const originalWidth = 141;
    const originalHeight = 44;
    const src = rect(0, 0, originalWidth, originalHeight);
    const dst = rect(0, 0, width, height * 0.8);

    // fadeIn on first load
    const fadeIn = useSharedValue(0);
    if (inproxyStatus !== "UNKNOWN") {
        fadeIn.value = withDelay(
            inproxyStatus === "STOPPED" ? PARTICLE_VIDEO_DELAY_MS : 0,
            withTiming(1, { duration: 2000 }),
        );
    }

    return (
        <View
            style={[
                {
                    width: width,
                    height: height,
                },
            ]}
        >
            <Canvas style={[ss.flex]}>
                <FaderGroup opacity={fadeIn}>
                    <Group transform={fitbox("contain", src, dst)}>
                        <ImageSVG
                            svg={conduitWordMarkSvg}
                            x={0}
                            y={height * 0.1}
                        />
                    </Group>
                </FaderGroup>
            </Canvas>
        </View>
    );
}

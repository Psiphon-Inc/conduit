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
    BlendColor,
    Blur,
    ColorMatrix,
    Group,
    ImageSVG,
    Paint,
    fitbox,
    interpolateColors,
    rect,
    useSVG,
} from "@shopify/react-native-skia";
import React from "react";
import {
    SharedValue,
    cancelAnimation,
    useDerivedValue,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated";

import { FaderGroup } from "@/src/components/canvas/FaderGroup";
import { palette } from "@/src/styles";

export function PsiphonConduitLoading({
    size,
    opacity,
}: {
    size: number;
    opacity: SharedValue<number>;
}) {
    // animate the conduit flower logo to cycle through different colors
    const lfo = useSharedValue(0);

    const conduitFlowerSvg = useSVG(
        require("@/assets/images/conduit-flower-icon.svg"),
    );
    const cyclePalette = [
        palette.white,
        palette.blue,
        palette.purple,
        palette.red,
    ];
    const flowerColor = useDerivedValue(() => {
        return interpolateColors(
            lfo.value,
            Array.from(cyclePalette.keys()),
            cyclePalette,
        );
    });
    const flowerOriginalDim = 26;
    const flowerSize = size / 3;
    const flowerSrc = rect(0, 0, flowerOriginalDim, flowerOriginalDim);
    const flowerDst = rect(
        size / 2 - flowerSize / 2,
        flowerSize / 2,
        flowerSize,
        flowerSize,
    );

    // Gives a nice oscillating blur effect
    const morphMatrix = useDerivedValue(() => {
        // prettier-ignore
        return [
            // R, G, B, A, Bias
            1, 0, 0, 0, 0,
            0, 1, 0, 0, 0,
            0, 0, 1, 0, 0,
            0, 0, 0, (lfo.value+0.5)*3, -0.3,
    ]
    });

    React.useEffect(() => {
        lfo.value = withRepeat(withTiming(3, { duration: 3000 }), -1, true);
        return () => {
            cancelAnimation(lfo);
            lfo.value = 0;
        };
    }, []);

    return (
        <FaderGroup opacity={opacity}>
            <Group
                layer={
                    <Paint>
                        <BlendColor color={flowerColor} mode="srcIn" />
                    </Paint>
                }
                transform={fitbox("contain", flowerSrc, flowerDst)}
            >
                <Group
                    layer={
                        <Paint>
                            <Blur blur={1} />
                            <ColorMatrix matrix={morphMatrix} />
                        </Paint>
                    }
                >
                    <ImageSVG
                        svg={conduitFlowerSvg}
                        width={flowerSize}
                        height={flowerSize}
                    />
                </Group>
            </Group>
        </FaderGroup>
    );
}

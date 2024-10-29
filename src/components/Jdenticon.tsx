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
    Circle,
    Group,
    ImageSVG,
    LinearGradient,
    Skia,
    vec,
} from "@shopify/react-native-skia";
import * as jdenticon from "jdenticon";

import { hexToHueDegrees } from "@/src/common/utils";
import { palette, sharedStyles as ss } from "@/src/styles";

// useful for setting these values: https://jdenticon.com/icon-designer.html
const defaultConfig: jdenticon.JdenticonConfig = {
    hues: [
        hexToHueDegrees(palette.red),
        hexToHueDegrees(palette.blue),
        hexToHueDegrees(palette.maroon),
        hexToHueDegrees(palette.red),
        hexToHueDegrees(palette.blue),
        hexToHueDegrees(palette.maroon),
        hexToHueDegrees(palette.red),
        hexToHueDegrees(palette.blue),
        hexToHueDegrees(palette.maroon),
    ],
    lightness: {
        color: [0.4, 0.8],
        grayscale: [0.15, 0.9],
    },
    saturation: {
        color: 0.8,
        grayscale: 0.7,
    },
    backColor: palette.transparent,
};

export function Jdenticon({
    value,
    size,
    config = defaultConfig,
}: {
    value: string;
    size: number;
    config?: jdenticon.JdenticonConfig;
}) {
    const svg = Skia.SVG.MakeFromString(
        jdenticon.toSvg(value, size * 0.8, config),
    );

    return (
        <Canvas style={[ss.flex]}>
            <Circle cx={size / 2} cy={size / 2} r={size / 2} style="fill">
                <LinearGradient
                    start={vec(0, size)}
                    end={vec(size, 0)}
                    colors={[palette.red, palette.blue]}
                />
            </Circle>
            <Group
                transform={[
                    { translateX: size * 0.1 },
                    { translateY: size * 0.1 },
                ]}
            >
                <ImageSVG svg={svg} />
            </Group>
        </Canvas>
    );
}

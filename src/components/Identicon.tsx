import React from "react";
import Svg, {
    Circle,
    Defs,
    G,
    LinearGradient,
    Stop,
    SvgXml,
} from "react-native-svg";

import { identicon } from "@/src/common/identicon";
import { palette } from "@/src/styles";

export function Identicon({ value, size }: { value: string; size: number }) {
    // Generate the jdenticon SVG string
    const svgString = identicon(value, size);

    return (
        <Svg width={size} height={size}>
            <Defs>
                <LinearGradient id="grad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <Stop offset="0" stopColor={palette.conduitRed} />
                    <Stop offset="1" stopColor={palette.conduitBlue} />
                </LinearGradient>
            </Defs>
            <Circle
                cx={size / 2}
                cy={size / 2}
                r={size / 2}
                fill="url(#grad)"
            />
            <G x={size * 0.1} y={size * 0.1}>
                <SvgXml
                    xml={svgString}
                    width={size * 0.8}
                    height={size * 0.8}
                />
            </G>
        </Svg>
    );
}

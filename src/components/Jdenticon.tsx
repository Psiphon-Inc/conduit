import { Canvas, ImageSVG, Skia } from "@shopify/react-native-skia";
import * as jdenticon from "jdenticon";

import { hexToHueDegrees } from "@/src/common/utils";
import { palette, sharedStyles as ss } from "@/src/styles";

// useful for setting these values: https://jdenticon.com/icon-designer.html
const defaultConfig: jdenticon.JdenticonConfig = {
    hues: [hexToHueDegrees(palette.red)],
    lightness: {
        color: [0.2, 0.6],
        grayscale: [0.15, 0.9],
    },
    saturation: {
        color: 0.8,
        grayscale: 0.7,
    },
    backColor: palette.blue,
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
    const svg = Skia.SVG.MakeFromString(jdenticon.toSvg(value, size, config));

    return (
        <Canvas style={[ss.flex]}>
            <ImageSVG svg={svg} x={0} y={0} width={size} height={size} />
        </Canvas>
    );
}

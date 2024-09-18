import {
    BlendMode,
    Canvas,
    Group,
    ImageSVG,
    Skia,
    useSVG,
} from "@shopify/react-native-skia";
import React from "react";
import { View } from "react-native";

import { palette, sharedStyles as ss } from "@/src/styles";

export function ConduitWordmark({
    size = 100,
    color = palette.white,
}: {
    size?: number;
    color?: string;
}) {
    const conduitWordMarkSvg = useSVG(
        require("@/assets/images/conduit-wordmark.svg"),
    );

    const originalWidth = 380;
    const originalHeight = 78;
    const heightRatio = originalHeight / originalWidth;

    const paint = React.useMemo(() => Skia.Paint(), []);
    paint.setColorFilter(
        Skia.ColorFilter.MakeBlend(Skia.Color(color), BlendMode.SrcIn),
    );

    return (
        <View
            style={{
                width: size,
                height: size * heightRatio,
            }}
        >
            <Canvas style={[ss.flex]}>
                <Group layer={paint}>
                    <ImageSVG
                        svg={conduitWordMarkSvg}
                        width={size}
                        height={size * heightRatio}
                    />
                </Group>
            </Canvas>
        </View>
    );
}

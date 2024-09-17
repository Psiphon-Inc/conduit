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

export function ConduitFlowerIcon({
    size = 100,
    color = palette.white,
}: {
    size?: number;
    color?: string;
}) {
    const conduitWordMarkSvg = useSVG(
        require("@/assets/images/conduit-flower-icon.svg"),
    );

    const paint = React.useMemo(() => Skia.Paint(), []);
    paint.setColorFilter(
        Skia.ColorFilter.MakeBlend(Skia.Color(color), BlendMode.SrcIn),
    );

    return (
        <View
            style={{
                width: size,
                height: size,
            }}
        >
            <Canvas style={[ss.flex]}>
                <Group layer={paint}>
                    <ImageSVG
                        svg={conduitWordMarkSvg}
                        width={size}
                        height={size}
                    />
                </Group>
            </Canvas>
        </View>
    );
}

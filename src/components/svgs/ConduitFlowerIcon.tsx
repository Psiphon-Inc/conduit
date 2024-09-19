import {
    BlendMode,
    Canvas,
    ColorMatrix,
    Group,
    ImageSVG,
    Paint,
    Skia,
    useSVG,
} from "@shopify/react-native-skia";
import React from "react";
import { View } from "react-native";

import { palette, sharedStyles as ss } from "@/src/styles";
import {
    useDerivedValue,
    useSharedValue,
    withDelay,
    withTiming,
} from "react-native-reanimated";
import { useInProxyContext } from "@/src/psiphon/mockContext";

export function ConduitFlowerIcon({
    size = 100,
    color = palette.white,
}: {
    size?: number;
    color?: string;
}) {
    const { getInProxyStatus } = useInProxyContext();
    const conduitFlowerSvg = useSVG(
        require("@/assets/images/conduit-flower-icon.svg")
    );

    const paint = React.useMemo(() => Skia.Paint(), []);
    paint.setColorFilter(
        Skia.ColorFilter.MakeBlend(Skia.Color(color), BlendMode.SrcIn)
    );

    // fadeIn on first load
    const fadeIn = useSharedValue(0);
    React.useEffect(() => {
        const inProxyStatus = getInProxyStatus();
        if (inProxyStatus.status === "running") {
            // fade in right away
            fadeIn.value = withTiming(1, { duration: 2000 });
        } else if (inProxyStatus.status === "stopped") {
            // fade in after a delay for particle animation
            fadeIn.value = withDelay(2800, withTiming(1, { duration: 2000 }));
        }
        // implicit do nothing on status unknown
    }, [getInProxyStatus]);

    const opacityMatrix = useDerivedValue(() => {
        return [
            // R, G, B, A, Bias
            // prettier-ignore
            1, 0, 0, 0, 0,
            // prettier-ignore
            0, 1, 0, 0, 0,
            // prettier-ignore
            0, 0, 1, 0, 0,
            // prettier-ignore
            0, 0, 0, fadeIn.value, 0,
        ];
    });

    return (
        <View
            style={{
                width: size,
                height: size,
            }}
        >
            <Canvas style={[ss.flex]}>
                <Group layer={paint}>
                    <Group
                        layer={
                            <Paint>
                                <ColorMatrix matrix={opacityMatrix} />
                            </Paint>
                        }
                    >
                        <ImageSVG
                            svg={conduitFlowerSvg}
                            width={size}
                            height={size}
                            opacity={fadeIn}
                        />
                    </Group>
                </Group>
            </Canvas>
        </View>
    );
}

import {
    Canvas,
    ColorMatrix,
    Group,
    ImageSVG,
    Paint,
    fitbox,
    rect,
    useSVG,
} from "@shopify/react-native-skia";
import React from "react";
import { View } from "react-native";
import {
    useDerivedValue,
    useSharedValue,
    withDelay,
    withTiming,
} from "react-native-reanimated";

import { PARTICLE_VIDEO_DELAY_MS } from "@/src/constants";
import { useInProxyStatus } from "@/src/inproxy/hooks";
import { sharedStyles as ss } from "@/src/styles";

export function LogoWordmark({
    width,
    height,
}: {
    width: number;
    height: number;
}) {
    const { data: inProxyStatus } = useInProxyStatus();

    const conduitWordMarkSvg = useSVG(
        require("@/assets/images/psiphon-conduit-wordmark.svg"),
    );
    const originalWidth = 141;
    const originalHeight = 44;
    const src = rect(0, 0, originalWidth, originalHeight);
    const dst = rect(0, 0, width, height * 0.8);

    // fadeIn on first load
    const fadeIn = useSharedValue(0);
    if (inProxyStatus !== "UNKNOWN") {
        fadeIn.value = withDelay(
            inProxyStatus === "STOPPED" ? PARTICLE_VIDEO_DELAY_MS : 0,
            withTiming(1, { duration: 2000 }),
        );
    }

    const opacityMatrix = useDerivedValue(() => {
        // prettier-ignore
        return [
         // R, G, B, A, Bias
            1, 0, 0, 0, 0,
            0, 1, 0, 0, 0,
            0, 0, 1, 0, 0,
            0, 0, 0, fadeIn.value, 0,
        ];
    });

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
                <Group
                    layer={
                        <Paint>
                            <ColorMatrix matrix={opacityMatrix} />
                        </Paint>
                    }
                >
                    <Group transform={fitbox("contain", src, dst)}>
                        <ImageSVG
                            svg={conduitWordMarkSvg}
                            x={0}
                            y={height * 0.1}
                        />
                    </Group>
                </Group>
            </Canvas>
        </View>
    );
}

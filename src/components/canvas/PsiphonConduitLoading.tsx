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

import { palette } from "@/src/styles";

export function PsiphonConduitLoading({
    size,
    opacity,
}: {
    size: number;
    opacity: SharedValue<number>;
}) {
    // animate the conduit flower logo pulsing with different colors
    const conduitFlowerSvg = useSVG(
        require("@/assets/images/conduit-flower-icon.svg"),
    );
    const cyclePalette = [
        palette.white,
        palette.blue,
        palette.purple,
        palette.red,
    ];
    const lfo = useSharedValue(0);
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

    // Allow parent to fade loader in and out by passing an animated opacity
    const opacityMatrix = useDerivedValue(() => {
        // prettier-ignore
        return [
         // R, G, B, A, Bias
            1, 0, 0, 0, 0,
            0, 1, 0, 0, 0,
            0, 0, 1, 0, 0,
            0, 0, 0, opacity.value, 0,
        ];
    });

    React.useEffect(() => {
        lfo.value = withRepeat(withTiming(3, { duration: 3000 }), -1, true);
        () => {
            cancelAnimation(lfo);
            lfo.value = 0;
        };
    }, []);

    return (
        <Group
            layer={
                <Paint>
                    <ColorMatrix matrix={opacityMatrix} />
                </Paint>
            }
        >
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
        </Group>
    );
}

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
    // draw Psiphon Conduit wordmark
    const conduitSvg = useSVG(require("@/assets/images/conduit.svg"));
    const psiphonSvg = useSVG(require("@/assets/images/psiphon.svg"));
    const wordmarksOriginalWidth = 319;
    const wordmarksOriginalHeight = 78;
    const wordmarksTargetWidth = size; //100
    const wordmarksTargetHeight =
        (wordmarksTargetWidth / wordmarksOriginalWidth) *
        wordmarksOriginalHeight;
    const wordmarkSrc = rect(
        0,
        0,
        wordmarksOriginalWidth,
        wordmarksOriginalHeight,
    );
    const wordmarkDst = rect(
        (size - wordmarksTargetWidth) / 2,
        0,
        wordmarksTargetWidth,
        wordmarksTargetHeight,
    );

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
        wordmarksTargetHeight * 2.2,
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
            0, 0, 0, (lfo.value+0.5)*3, -0.2,
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
            <Group transform={fitbox("contain", wordmarkSrc, wordmarkDst)}>
                <ImageSVG
                    svg={psiphonSvg}
                    y={0}
                    height={wordmarksOriginalHeight}
                    width={wordmarksOriginalWidth}
                />
            </Group>
            <Group transform={fitbox("contain", wordmarkSrc, wordmarkDst)}>
                <ImageSVG
                    svg={conduitSvg}
                    y={wordmarksOriginalHeight}
                    height={wordmarksOriginalHeight}
                    width={wordmarksOriginalWidth}
                />
            </Group>
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

import {
    BlendMode,
    Canvas,
    ColorMatrix,
    Group,
    ImageSVG,
    Paint,
    Skia,
    Text,
    useFont,
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

// @ts-ignore (this file is gitignored)
import { GIT_HASH } from "@/src/git-hash";
import { useInProxyContext } from "@/src/inproxy/mockContext";
import { palette, sharedStyles as ss } from "@/src/styles";

export function LogoWordmark({
    width,
    height,
}: {
    width: number;
    height: number;
}) {
    const { getInProxyStatus } = useInProxyContext();
    const conduitFlowerSvg = useSVG(
        require("@/assets/images/conduit-flower-icon.svg"),
    );
    const conduitWordMarkSvg = useSVG(
        require("@/assets/images/conduit-wordmark.svg"),
    );

    // fadeIn on first load
    const fadeIn = useSharedValue(0);
    React.useEffect(() => {
        const inProxyStatus = getInProxyStatus();
        if (inProxyStatus === "RUNNING") {
            // fade in right away
            fadeIn.value = withTiming(1, { duration: 2000 });
        } else if (inProxyStatus === "STOPPED") {
            // fade in after a delay for particle animation
            fadeIn.value = withDelay(2800, withTiming(1, { duration: 2000 }));
        }
        // implicit do nothing on status unknown
    }, [getInProxyStatus]);

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

    const paint = React.useMemo(() => Skia.Paint(), []);
    paint.setColorFilter(
        Skia.ColorFilter.MakeBlend(
            Skia.Color(palette.purpleTint4),
            BlendMode.SrcIn,
        ),
    );

    const font = useFont(require("@/assets/fonts/SpaceMono-Regular.ttf"), 20);
    if (!font) {
        return null;
    }
    const versionString = `v.${GIT_HASH}`;

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
                    <Group layer={paint}>
                        <ImageSVG
                            svg={conduitFlowerSvg}
                            width={width * 0.2}
                            height={height * 0.6}
                            y={height * 0.2}
                        />
                        <ImageSVG
                            svg={conduitWordMarkSvg}
                            width={width * 0.4}
                            height={height * 0.4}
                            x={width * 0.2}
                            y={height * 0.3}
                        />
                    </Group>
                    <Text
                        x={width - font.measureText(versionString).width - 10}
                        y={height - height * 0.3}
                        text={versionString}
                        font={font}
                        color={palette.transparentPurple}
                    />
                </Group>
            </Canvas>
        </View>
    );
}

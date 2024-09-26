import {
    BlendMode,
    Canvas,
    ColorMatrix,
    Group,
    ImageSVG,
    Paint,
    Skia,
    Text,
    fitbox,
    rect,
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
import { useInProxyStatus } from "@/src/inproxy/hooks";
import { fonts, palette, sharedStyles as ss } from "@/src/styles";

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
    React.useEffect(() => {
        if (inProxyStatus === "RUNNING") {
            // fade in right away
            fadeIn.value = withTiming(1, { duration: 2000 });
        } else if (inProxyStatus === "STOPPED") {
            // fade in after a delay for particle animation
            fadeIn.value = withDelay(2800, withTiming(1, { duration: 2000 }));
        }
        // implicit do nothing on status unknown
    }, [inProxyStatus]);

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
        Skia.ColorFilter.MakeBlend(Skia.Color(palette.white), BlendMode.SrcIn),
    );

    const font = useFont(fonts.JuraRegular, 20);
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
                    <Group
                        transform={fitbox("contain", src, dst)}
                        layer={paint}
                    >
                        <ImageSVG
                            svg={conduitWordMarkSvg}
                            x={0}
                            y={height * 0.1}
                        />
                    </Group>
                    <Text
                        x={width - font.measureText(versionString).width - 10}
                        y={font.measureText(versionString).height}
                        text={versionString}
                        font={font}
                        color={palette.transparentPurple}
                    />
                </Group>
            </Canvas>
        </View>
    );
}

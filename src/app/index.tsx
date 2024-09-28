import {
    BlendColor,
    Blur,
    Canvas,
    ColorMatrix,
    Group,
    ImageSVG,
    Paint,
    fitbox,
    interpolateColors,
    rect,
    useSVG,
} from "@shopify/react-native-skia";
import { router } from "expo-router";
import React from "react";
import { View, useWindowDimensions } from "react-native";
import {
    runOnJS,
    useDerivedValue,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated";

import { useAuthContext } from "@/src/auth/context";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { palette, sharedStyles as ss } from "@/src/styles";

export default function Index() {
    const { signIn } = useAuthContext();
    const win = useWindowDimensions();

    const canvasSize = win.width;

    // draw Psiphon Conduit wordmark
    const conduitSvg = useSVG(require("@/assets/images/conduit.svg"));
    const psiphonSvg = useSVG(require("@/assets/images/psiphon.svg"));
    const wordmarksOriginalWidth = 319;
    const wordmarksOriginalHeight = 78;
    const wordmarksTargetWidth = canvasSize / 3; //100
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
        (canvasSize - wordmarksTargetWidth) / 2,
        0,
        wordmarksTargetWidth,
        wordmarksTargetHeight,
    );

    // animate the conduit flower logo pulsing with different colors while the
    // signIn is running.
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
    const flowerSize = canvasSize / 4;
    const flowerSrc = rect(0, 0, flowerOriginalDim, flowerOriginalDim);
    const flowerDst = rect(
        canvasSize / 2 - flowerSize / 2,
        wordmarksTargetHeight * 2.2,
        flowerSize,
        flowerSize,
    );

    const opacity = useSharedValue(0);

    function doSignIn() {
        signIn().then((result) => {
            if (result instanceof Error) {
                // TODO: Right now we will never learn about signIn errors since
                // we can't record error into feedback log yet
                // Show some error state in the UI with some steps to fix?
                console.error(result);
            } else {
                // Route to home screen as soon as the credentials are loaded,
                // this may happen before the splash animation fully completes
                // replace as we do not want user to be able to go "back" to
                // the splash screen
                console.log("signIn complete");
                opacity.value = withTiming(0, { duration: 600 }, () => {
                    console.log("opacity complete callback");
                    runOnJS(router.replace)("/(app)/");
                });
            }
        });
    }

    React.useEffect(() => {
        lfo.value = withRepeat(withTiming(3, { duration: 3000 }), -1, true);
        // NOTE: This is introducing an artificial delay of 1 second to have the
        // nice fade in before signing in, since sign in is nearly instant now
        // that we are storing the derived conduit key in SecureStore.
        opacity.value = withTiming(1, { duration: 1000 }, () =>
            runOnJS(doSignIn)(),
        );
    }, []);

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

    return (
        <SafeAreaView>
            <View
                style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                }}
            >
                <View
                    style={{
                        width: canvasSize,
                        height: canvasSize,
                    }}
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
                                transform={fitbox(
                                    "contain",
                                    wordmarkSrc,
                                    wordmarkDst,
                                )}
                            >
                                <ImageSVG
                                    svg={psiphonSvg}
                                    y={0}
                                    height={wordmarksOriginalHeight}
                                    width={wordmarksOriginalWidth}
                                />
                            </Group>
                            <Group
                                transform={fitbox(
                                    "contain",
                                    wordmarkSrc,
                                    wordmarkDst,
                                )}
                            >
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
                                        <BlendColor
                                            color={flowerColor}
                                            mode="srcIn"
                                        />
                                    </Paint>
                                }
                                transform={fitbox(
                                    "contain",
                                    flowerSrc,
                                    flowerDst,
                                )}
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
                    </Canvas>
                </View>
            </View>
        </SafeAreaView>
    );
}

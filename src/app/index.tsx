import {
    BlendColor,
    Blur,
    Canvas,
    ColorShader,
    Group,
    Image,
    ImageSVG,
    Paint,
    Text,
    interpolateColors,
    useFont,
    useImage,
    useSVG,
} from "@shopify/react-native-skia";
import React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import {
    useDerivedValue,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuthContext } from "@/src/auth/context";
import { handleError } from "@/src/common/errors";
import { palette, sharedStyles as ss } from "@/src/styles";
import { router } from "expo-router";

export default function Index() {
    const insets = useSafeAreaInsets();
    const { signIn } = useAuthContext();
    const { t } = useTranslation();

    const conduitFlowerSvg = useSVG(
        require("@/assets/images/conduit-flower-icon.svg"),
    );
    const testImage = useImage(require("@/assets/images/flower-no-bg.png"));

    const canvasSize = 300;
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

    const maxFlowerSize = 80;
    const flowerSize = useDerivedValue(() => {
        return maxFlowerSize - lfo.value * 5;
    });
    const flowerCenteringTransform = useDerivedValue(() => {
        return [
            { translateX: canvasSize / 2 - flowerSize.value / 2 },
            { translateY: canvasSize / 2 - flowerSize.value / 2 },
        ];
    });

    React.useEffect(() => {
        lfo.value = withRepeat(withTiming(3, { duration: 3000 }), -1, true);
        signIn().then((result) => {
            if (result instanceof Error) {
                handleError(result);
            } else {
                // Route to home screen as soon as the credentials are loaded,
                // this may happen before the splash animation fully completes
                // replace as we do not want user to be able to go "back" to
                // the splash screen
                router.replace("/(app)/");
            }
        });
    }, []);

    const loadingText = t("LOADING_I18N.string");
    const font = useFont(require("@/assets/fonts/SpaceMono-Regular.ttf"), 20);
    if (!font) {
        return null;
    }

    return (
        <View
            style={{
                flex: 1,
                marginTop: insets.top,
                marginBottom: insets.bottom,
                marginLeft: insets.left,
                marginRight: insets.right,
            }}
        >
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
                                    <BlendColor
                                        color={flowerColor}
                                        mode="srcIn"
                                    />
                                </Paint>
                            }
                            transform={flowerCenteringTransform}
                        >
                            <ImageSVG
                                svg={conduitFlowerSvg}
                                width={flowerSize}
                                height={flowerSize}
                            />
                            <Image
                                image={testImage}
                                width={flowerSize}
                                height={flowerSize}
                            />
                            <Blur blur={lfo} />
                        </Group>
                        <Text
                            x={
                                canvasSize / 2 -
                                font.measureText(loadingText).width / 2
                            }
                            y={canvasSize / 2 + maxFlowerSize}
                            text={loadingText}
                            font={font}
                        >
                            <ColorShader color={flowerColor} />
                            <Blur blur={3} />
                        </Text>
                        <Text
                            x={
                                canvasSize / 2 -
                                font.measureText(loadingText).width / 2
                            }
                            y={canvasSize / 2 + maxFlowerSize}
                            text={loadingText}
                            font={font}
                        >
                            <ColorShader color={flowerColor} />
                        </Text>
                    </Canvas>
                </View>
            </View>
        </View>
    );
}

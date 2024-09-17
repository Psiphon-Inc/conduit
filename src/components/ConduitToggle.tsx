import {
    Blur,
    Canvas,
    Circle,
    ColorMatrix,
    ColorShader,
    Group,
    Paint,
    RadialGradient,
    Rect,
    RoundedRect,
    Shadow,
    Text,
    interpolateColors,
    interpolateVector,
    useFont,
    vec,
} from "@shopify/react-native-skia";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import {
    useDerivedValue,
    useFrameCallback,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";

import { palette, sharedStyles as ss } from "@/src/styles";

export function ConduitToggle({ size }: { size: number }) {
    const { t } = useTranslation();

    // The button is placed into a square Canvas that is 1/2.5 x the size, so that
    // there is room for the orbiting elements. Therefore, our transform needs
    // to center at 3/2 radius.
    const radius = size / 4;
    const centeringTransform = [
        {
            translateY: size/2,
        },
        {
            translateX: size/2,
        },
    ];
    const [inProxyOn, setInProxyOn] = React.useState(false);
    const [inProxyPeersConnected, setInProxyPeersConnected] = React.useState(0);
    const buttonText = t("TURN_ON_I18N.string");

    const dxA = useSharedValue(10);
    const dxB = useSharedValue(-10);
    const animatedBlur = useSharedValue(10);
    const buttonInnerColours = [
        palette.redShade3,
        palette.redShade2,
        palette.redShade1,
        palette.red,
        palette.blue,
    ];
    const buttonOuterColours = [
        palette.purpleShade5,
        palette.purpleShade3,
        palette.purpleShade1,
        palette.purple,
        palette.purpleShade3,
    ];
    const buttonColoursIndex = useSharedValue(0);
    const buttonTextColours = [palette.blueTint5, palette.transparent];
    const buttonTextColourIndex = useSharedValue(0);
    const growRadius = useSharedValue(0);
    const spinner = useSharedValue(0);

    function animateAnnouncing() {
        dxA.value = withTiming(0, { duration: 2000 });
        dxB.value = withTiming(0, { duration: 2000 });
        animatedBlur.value = withTiming(0, { duration: 2000 });
        growRadius.value = withTiming(radius, { duration: 500 });
        buttonColoursIndex.value = withRepeat(
            // only animate through the first 4 colors
            withTiming(3, {
                duration: 2000,
            }),
            -1,
            true
        );
        buttonTextColourIndex.value = withTiming(1, { duration: 500 });
    }

    function animatePeersConnected() {
        dxA.value = withTiming(10, { duration: 2000 });
        dxB.value = withTiming(-10, { duration: 2000 });
        animatedBlur.value = withTiming(10, { duration: 2000 });
        buttonColoursIndex.value = withTiming(4, { duration: 2000 });
        spinner.value = withSequence(
            withTiming(-1, { duration: 2000 }),
            withRepeat(withTiming(1, { duration: 8000 }), -1)
        );
    }

    function animateTurnOff() {
        dxA.value = withTiming(10, { duration: 2000 });
        dxB.value = withTiming(-10, { duration: 2000 });
        animatedBlur.value = withTiming(10, { duration: 2000 });
        growRadius.value = withTiming(0, { duration: 2000 });
        buttonColoursIndex.value = withTiming(0, { duration: 500 });
        buttonTextColourIndex.value = withTiming(0, { duration: 500 });
        spinner.value = withTiming(0, { duration: 500 });
    }

    React.useEffect(() => {
        if (inProxyOn) {
            if (inProxyPeersConnected === 0) {
                animateAnnouncing();
            } else {
                animatePeersConnected();
            }
        } else {
            animateTurnOff();
        }
    }, [inProxyOn, inProxyPeersConnected]);

    const buttonGradientColours = useDerivedValue(() => {
        return [
            interpolateColors(
                buttonColoursIndex.value,
                [0, 1, 2, 3, 4],
                buttonInnerColours
            ),
            interpolateColors(
                buttonColoursIndex.value,
                [0, 1, 2, 3, 4],
                buttonOuterColours
            ),
        ];
    });

    const buttonTextColour = useDerivedValue(() => {
        return interpolateColors(
            buttonTextColourIndex.value,
            [0, 1],
            buttonTextColours
        );
    });

    const velX = useSharedValue(5);
    const velY = useSharedValue(1);

    const randomizeVelocity = useFrameCallback((frameInfo) => {
        velX.value = Math.random() * 10;
        velY.value = Math.random() * 2;
    });

    const spinVec = useDerivedValue(() => {
        return interpolateVector(
            spinner.value,
            [-1, 0, 0.4, 1],
            [
                vec(-size, radius),
                vec(0, radius / 6),
                vec(radius / 2, -radius / 2),
                vec(size, radius / 3),
            ]
        );
    });

    // START TODO: Placeholder
    const mockPeersRef = React.useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const toggleInProxy = () => {
        console.log("toggle in proxy");
        if (inProxyPeersConnected !== 0) {
            setInProxyPeersConnected(0);
        }
        if (!inProxyOn) {
            setInProxyOn(true);
            if (!mockPeersRef.current) {
                mockPeersRef.current = setTimeout(() => {
                    setInProxyPeersConnected(5);
                }, 5000);
            }
        } else {
            setInProxyOn(false);
            if (mockPeersRef.current) {
                clearTimeout(mockPeersRef.current);
                mockPeersRef.current = null;
            }
        }
    };
    // END TODO: Placeholder

    // Inspired by the "Metaball Animation" tutorial in react-native-skia docs
    const morphLayer = React.useMemo(() => {
        return <Paint>
            <Blur blur={5} />
            <ColorMatrix
                matrix={[
                    // R, G, B, A, Bias
                    // prettier-ignore
                    1, 0, 0, 0, 0,
                    // prettier-ignore
                    0, 1, 0, 0, 0,
                    // prettier-ignore
                    0, 0, 1, 0, 0,
                    // prettier-ignore
                    0, 0, 0, 5, -2 
                ]}
            />
        </Paint>
    }, []);

    const font = useFont(
        require("../../assets/fonts/SpaceMono-Regular.ttf"),
        20
    );
    if (!font) {
        return null;
    }
    const buttonTextXOffset = -font.measureText(buttonText).width / 2;
    const buttonTextYOffset = font.measureText(buttonText).height / 2;

    return (
        <View
            style={{
                width: size,
                height: size,
            }}
        >
            <Canvas style={[ss.flex]}>
                <Group transform={centeringTransform}>
                    <Group layer={morphLayer}>
                    <Group>
                        <Circle r={radius} color={palette.black}>
                            <Shadow
                                dx={dxA}
                                dy={dxA}
                                blur={animatedBlur}
                                color={palette.purple}
                                inner
                            />
                            <Shadow
                                dx={dxB}
                                dy={dxB}
                                blur={animatedBlur}
                                color={palette.blue}
                                inner
                            />
                            <RadialGradient
                                c={spinVec}
                                r={growRadius}
                                colors={buttonGradientColours}
                            />
                        </Circle>
                        <Circle r={radius} style="stroke" strokeWidth={2} color={palette.blueTint4} />
                    </Group>
                    {inProxyPeersConnected > 0 && (
                        <Group>
                            <Circle
                                c={spinVec}
                                r={radius / 10}
                                color={palette.blue}
                            ></Circle>
                            <Blur blur={2} />
                        </Group>
                    )}
                    </Group>
                    <Group>
                        <Text
                            x={buttonTextXOffset}
                            y={buttonTextYOffset}
                            text={buttonText}
                            font={font}
                        >
                            <ColorShader color={buttonTextColour} />
                        </Text>
                    </Group>
                    {inProxyPeersConnected > 0 && (
                        <Group>
                            <Circle
                                c={spinVec}
                                r={radius / 10}
                                color={palette.blue}
                            ></Circle>
                            <Blur blur={2} />
                        </Group>
                    )}
                </Group>
            </Canvas>
            <Pressable
                style={[
                    ss.absolute,
                    {
                        width: size,
                        height: size,
                        left: 0.25 * size,
                        borderRadius: size / 2,
                    },
                ]}
                onPress={() => {
                        toggleInProxy();
                }}
            />
        </View>
    );
}

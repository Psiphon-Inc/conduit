import {
    Blur,
    Canvas,
    Circle,
    ColorMatrix,
    ColorShader,
    Group,
    Paint,
    RadialGradient,
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

//import { useInProxyContext } from "@/src/psiphon/context";
import { useInProxyContext } from "@/src/psiphon/mockContext";
import { palette, sharedStyles as ss } from "@/src/styles";

export function ConduitOrbToggle({ size }: { size: number }) {
    const { t } = useTranslation();
    const { toggleInProxy, isInProxyRunning, inProxyCurrentConnectedClients } =
        useInProxyContext();

    const radius = size / 4;
    const centeringTransform = [
        {
            translateY: size / 2,
        },
        {
            translateX: size / 2,
        },
    ];
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
    const buttonTextColours = [palette.redTint3, palette.transparent];
    const buttonTextColourIndex = useSharedValue(0);
    const growRadius = useSharedValue(0);
    const spinner = useSharedValue(0);

    function animateAnnouncing() {
        dxA.value = withTiming(0, { duration: 2000 });
        dxB.value = withTiming(0, { duration: 2000 });
        animatedBlur.value = withTiming(0, { duration: 2000 });
        growRadius.value = withTiming(radius, { duration: 500 });
        buttonColoursIndex.value = withRepeat(
            // only animate through the first 4 colors while announcing
            withTiming(3, {
                duration: 2000,
            }),
            -1,
            true,
        );
        buttonTextColourIndex.value = withTiming(1, { duration: 500 });
        spinner.value = withTiming(0, { duration: 500 });
    }

    function animatePeersConnected() {
        dxA.value = withTiming(10, { duration: 2000 });
        dxB.value = withTiming(-10, { duration: 2000 });
        animatedBlur.value = withTiming(10, { duration: 2000 });
        buttonColoursIndex.value = withTiming(4, { duration: 2000 });
        spinner.value = withSequence(
            withTiming(-1, { duration: 2000 }),
            withRepeat(withTiming(1, { duration: 5000 }), -1),
        );
    }

    function animateTurnOff() {
        dxA.value = withTiming(10, { duration: 2000 });
        dxB.value = withTiming(-10, { duration: 2000 });
        animatedBlur.value = withTiming(10, { duration: 2000 });
        growRadius.value = withTiming(0, { duration: 2000 });
        buttonColoursIndex.value = withTiming(0, { duration: 500 });
        buttonTextColourIndex.value = withTiming(0, { duration: 500 });
        spinner.value = withTiming(-1, { duration: 500 });
    }

    const [animationState, setAnimationState] = React.useState("idle");

    React.useEffect(() => {
        if (isInProxyRunning()) {
            if (inProxyCurrentConnectedClients === 0) {
                if (animationState !== "announcing") {
                    console.log("enter announcing state");
                    animateAnnouncing();
                    setAnimationState("announcing");
                }
            } else {
                if (animationState !== "active") {
                    console.log("enter peers connected state");
                    animatePeersConnected();
                    setAnimationState("active");
                }
                randomizeVelocity.setActive(true);
            }
        } else {
            randomizeVelocity.setActive(false);
            if (animationState !== "idle") {
                console.log("enter idle state");
                animateTurnOff();
                setAnimationState("idle");
            }
        }
    }, [isInProxyRunning, inProxyCurrentConnectedClients]);

    const buttonGradientColours = useDerivedValue(() => {
        return [
            interpolateColors(
                buttonColoursIndex.value,
                [0, 1, 2, 3, 4],
                buttonInnerColours,
            ),
            interpolateColors(
                buttonColoursIndex.value,
                [0, 1, 2, 3, 4],
                buttonOuterColours,
            ),
        ];
    });

    const buttonTextColour = useDerivedValue(() => {
        return interpolateColors(
            buttonTextColourIndex.value,
            [0, 1],
            buttonTextColours,
        );
    });

    // randomize the starting position of the light node every time it spawns
    const random = useSharedValue(1);
    const startSign = useSharedValue(1);
    const randomizerReady = useSharedValue(0);
    const randomizeVelocity = useFrameCallback((_) => {
        // pick new random values after each loop of the spinner
        if (spinner.value > 0.9 && randomizerReady.value === 1) {
            random.value = Math.random();
            if (Math.random() > 0.5) {
                startSign.value = 1;
            } else {
                startSign.value = -1;
            }
            randomizerReady.value = 0;
        }
        // reset the randomizer at the start of each loop
        if (spinner.value < 0.1 && randomizerReady.value === 0) {
            randomizerReady.value = 1;
        }
    });
    // interpolate between semi-random vectors to give a unique flight path
    const flightVec = useDerivedValue(() => {
        return interpolateVector(
            spinner.value,
            [-1, -0.6, 0, 0.6, 1],
            [
                vec(-size, ((startSign.value * size) / 1.5) * random.value),
                vec(-radius, startSign.value * radius * random.value),
                vec(0, 0),
                vec(radius, 0),
                vec(size, 0),
            ],
        );
    });

    // Inspired by the "Metaball Animation" tutorial in react-native-skia docs
    const morphLayer = React.useMemo(() => {
        return (
            <Paint>
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
                        0, 0, 0, 5, -2,
                    ]}
                />
            </Paint>
        );
    }, []);

    const font = useFont(require("@/assets/fonts/SpaceMono-Regular.ttf"), 20);
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
                                    c={flightVec}
                                    r={growRadius}
                                    colors={buttonGradientColours}
                                />
                            </Circle>
                            <Circle
                                r={radius}
                                style="stroke"
                                strokeWidth={2}
                                color={palette.blueTint4}
                            />
                        </Group>
                        {inProxyCurrentConnectedClients > 0 && (
                            <Group>
                                <Circle
                                    c={flightVec}
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
                    {inProxyCurrentConnectedClients > 0 && (
                        <Group>
                            <Circle
                                c={flightVec}
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

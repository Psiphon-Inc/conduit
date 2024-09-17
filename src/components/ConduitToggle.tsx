import {
    Canvas,
    Circle,
    ColorShader,
    Group,
    RadialGradient,
    Shadow,
    Text,
    interpolateColors,
    useFont,
    vec,
} from "@shopify/react-native-skia";
import React from "react";
import { Pressable } from "react-native";

import { palette, sharedStyles as ss } from "@/src/styles";
import {
    useDerivedValue,
    useSharedValue,
    withClamp,
    withRepeat,
    withTiming,
} from "react-native-reanimated";

export function ConduitToggle({ size }: { size: number }) {
    const radius = size / 2;
    const transform = [
        {
            translateY: radius,
        },
        {
            translateX: radius,
        },
    ];
    const [buttonText, setButtonText] = React.useState("Turn ON");
    const [inProxyOn, setInProxyOn] = React.useState(false);
    const [inProxyPeersConnected, setInProxyPeersConnected] = React.useState(0);

    const dxA = useSharedValue(10);
    const dxB = useSharedValue(-10);
    const animatedBlur = useSharedValue(10);
    const startColors = [
        palette.redShade3,
        palette.redShade2,
        palette.redShade1,
        palette.red,
        palette.blue,
        palette.blueShade4,
    ];
    const endColors = [
        palette.purpleShade5,
        palette.purpleShade3,
        palette.purpleShade1,
        palette.purple,
        palette.purpleShade3,
        palette.purpleShade5,
    ];
    const colorsIndex = useSharedValue(0);
    const growRadius = useSharedValue(0);

    function animateAnnouncing() {
        dxA.value = withTiming(0, { duration: 2000 });
        dxB.value = withTiming(0, { duration: 2000 });
        animatedBlur.value = withTiming(0, { duration: 2000 });
        growRadius.value = withTiming(radius, { duration: 500 });
        colorsIndex.value = withRepeat(
            // only animate through the first 4 colors
            withTiming(3, {
                duration: 2000,
            }),
            -1,
            true
        );
    }

    function animatePeersConnected() {
        colorsIndex.value = withTiming(4, {duration: 2000});
    }

    function animateTurnOff() {
        dxA.value = withTiming(10, { duration: 2000 });
        dxB.value = withTiming(-10, { duration: 2000 });
        animatedBlur.value = withTiming(10, { duration: 2000 });
        growRadius.value = withTiming(0, { duration: 2000 });
        colorsIndex.value = withTiming(5, { duration: 500 });
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

    const buttonGradientColors = useDerivedValue(() => {
        return [
            interpolateColors(colorsIndex.value, [0, 1, 2, 3, 4, 5], startColors),
            interpolateColors(colorsIndex.value, [0, 1, 2, 3, 4, 5], endColors),
        ];
    });

    // TODO: Placeholder
    const mockPeersRef = React.useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const toggleInProxy = () => {
        console.log("toggle in proxy");
        setInProxyOn(!inProxyOn);
        if (inProxyPeersConnected !== 0) {
            setInProxyPeersConnected(0);
        }
        if (buttonText === "Turn ON") {
            setButtonText("Awaiting Peers");
            if (!mockPeersRef.current) {
                mockPeersRef.current = setTimeout(() => {
                    setButtonText("Active");
                    setInProxyPeersConnected(5);
                }, 10000);
            }
        } else {
            setButtonText("Turn ON");
            if (mockPeersRef.current) {
                clearTimeout(mockPeersRef.current);
                mockPeersRef.current = null;
            }
        }
    };

    const font = useFont(
        require("../../assets/fonts/SpaceMono-Regular.ttf"),
        20
    );
    if (!font) {
        return null;
    }
    const textX = radius - font.measureText(buttonText).width / 2;
    const textY = radius + font.measureText(buttonText).height / 2;

    return (
        <Pressable
            style={{
                width: size,
                height: size,
            }}
            onPress={toggleInProxy}
        >
            <Canvas style={[ss.flex]}>
                <Group>
                    <Group transform={transform}>
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
                                c={vec(0, 0)}
                                r={growRadius}
                                colors={buttonGradientColors}
                            />
                        </Circle>
                        <Circle
                            r={radius - 2}
                            color={palette.blueTint3}
                            style="stroke"
                            strokeWidth={2}
                        />
                    </Group>
                </Group>
                <Group>
                    <Text x={textX} y={textY} text={buttonText} font={font}>
                        <ColorShader color={palette.white} />
                    </Text>
                </Group>
            </Canvas>
        </Pressable>
    );
}

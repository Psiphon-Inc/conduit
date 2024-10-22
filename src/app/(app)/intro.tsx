import {
    Blur,
    Canvas,
    Circle,
    Group,
    Image,
    ImageSVG,
    RadialGradient,
    Shadow,
    fitbox,
    rect,
    useImage,
    useSVG,
    vec,
} from "@shopify/react-native-skia";
import { useRouter } from "expo-router";
import React from "react";
import { View, useWindowDimensions } from "react-native";
import {
    Easing,
    runOnJS,
    useDerivedValue,
    useSharedValue,
    withDelay,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FaderGroup } from "@/src/components/canvas/FaderGroup";
import { palette, sharedStyles as ss } from "@/src/styles";

function Orb({ cx, cy, r }: { cx: number; cy: number; r: number }) {
    const win = useWindowDimensions();

    const fullHeight = win.height; // + insets.top + insets.bottom;

    const radius = useSharedValue(0);
    const shadowPos = useDerivedValue(() => {
        return radius.value / 5;
    });
    const shadowNeg = useDerivedValue(() => {
        return -radius.value / 5;
    });
    const shadowBlur = (r / 80) * 10;

    const computedelayMs = fullHeight - cy + cx * 4;

    React.useEffect(() => {
        radius.value = withDelay(
            computedelayMs,
            withSpring(r, {
                mass: 1.2,
                damping: 10,
                stiffness: 100,
                restDisplacementThreshold: 0.01,
                restSpeedThreshold: 2,
            }),
        );
    }, []);

    return (
        <Circle cx={cx} cy={cy} r={radius}>
            <Shadow
                dx={shadowPos}
                dy={shadowPos}
                blur={shadowBlur}
                color={palette.purple}
                inner
            />
            <Shadow
                dx={shadowNeg}
                dy={shadowNeg}
                blur={shadowBlur}
                color={palette.blue}
                inner
            />
            <RadialGradient
                c={vec(cx, cy)}
                r={radius}
                colors={[palette.redShade3, palette.black]}
            />
            <Blur blur={Math.floor((cy * 2) / fullHeight) * 1} />
        </Circle>
    );
}

export default function IntroScreen() {
    const win = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const fullHeight = win.height + insets.top + insets.bottom;
    const fullWidth = win.width + insets.left + insets.right;

    const opacity = useSharedValue(0);

    const backgroundEarthPng = useImage(
        require("@/assets/images/view-of-earth.png"),
    );
    const backgroundPanX = useSharedValue(0);
    const orbsPanTransform = useDerivedValue(() => {
        return [{ translateX: backgroundPanX.value }];
    });

    const conduitWordMarkSvg = useSVG(
        require("@/assets/images/psiphon-conduit-wordmark.svg"),
    );
    const originalWordMarkWidth = 141;
    const originalWordMarkHeight = 44;
    const wordMarkSrc = rect(
        0,
        0,
        originalWordMarkWidth,
        originalWordMarkHeight,
    );
    const wordMarkDst = rect(
        fullWidth * 0.1,
        fullHeight * 0.1,
        fullWidth * 0.8,
        fullHeight * 0.2,
    );
    const wordMarkResizeTransform = fitbox("contain", wordMarkSrc, wordMarkDst);

    React.useEffect(() => {
        opacity.value = withSequence(
            withTiming(1, { duration: 1000 }),
            withDelay(
                3000,
                withTiming(0, { duration: 1000 }, () => {
                    runOnJS(router.replace)("/(app)/onboarding");
                }),
            ),
        );
        backgroundPanX.value = withTiming(-win.width, {
            duration: 5000,
            easing: Easing.inOut(Easing.ease),
        });
    }, []);

    if (!backgroundEarthPng) {
        return null;
    }

    const bgWidth = win.width * 2;
    const bgHeight =
        (bgWidth / backgroundEarthPng.width()) * backgroundEarthPng.height();

    return (
        <View
            style={{
                width: fullWidth,
                height: fullHeight,
            }}
        >
            <Canvas style={[ss.flex]}>
                <Image
                    image={backgroundEarthPng}
                    fit="fitHeight"
                    x={backgroundPanX}
                    y={0}
                    width={bgWidth}
                    height={bgHeight}
                    opacity={opacity}
                />
                <FaderGroup opacity={opacity}>
                    <Group transform={wordMarkResizeTransform}>
                        <ImageSVG svg={conduitWordMarkSvg} x={0} y={0} />
                    </Group>
                </FaderGroup>
                <Group transform={orbsPanTransform} opacity={opacity}>
                    <Orb cx={fullWidth * 0.2} cy={fullHeight * 0.9} r={50} />
                    <Orb cx={fullWidth * 0.1} cy={fullHeight * 0.66} r={20} />
                    <Orb cx={fullWidth * 0.42} cy={fullHeight * 0.61} r={15} />
                    <Orb cx={fullWidth * 0.4} cy={fullHeight * 0.75} r={35} />
                    <Orb cx={fullWidth * 0.65} cy={fullHeight * 0.95} r={59} />
                    <Orb cx={fullWidth * 1.3} cy={fullHeight * 0.9} r={80} />
                    <Orb cx={fullWidth * 0.72} cy={fullHeight * 0.58} r={17} />
                    <Orb cx={fullWidth * 0.78} cy={fullHeight * 0.78} r={40} />
                    <Orb cx={fullWidth * 1.25} cy={fullHeight * 0.66} r={30} />
                    <Orb cx={fullWidth * 1.05} cy={fullHeight * 0.56} r={12} />
                    <Orb cx={fullWidth * 1.5} cy={fullHeight * 0.54} r={11} />
                    <Orb cx={fullWidth * 1.8} cy={fullHeight * 0.8} r={66} />
                    <Orb cx={fullWidth * 1.8} cy={fullHeight * 0.6} r={27} />
                </Group>
            </Canvas>
        </View>
    );
}

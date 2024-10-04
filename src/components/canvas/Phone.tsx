import { palette } from "@/src/styles";
import {
    Fill,
    Group,
    Image,
    LinearGradient,
    Path,
    Rect,
    RoundedRect,
    Turbulence,
    fitbox,
    rect,
    useImage,
    vec,
} from "@shopify/react-native-skia";
import React from "react";
import {
    Easing,
    cancelAnimation,
    useAnimatedReaction,
    useSharedValue,
    withDelay,
    withRepeat,
    withTiming,
} from "react-native-reanimated";
import { SharedValue } from "react-native-reanimated/lib/typescript/Animated";

import { ConduitConnectionLight } from "@/src/components/canvas/ConduitConnectionLight";

interface PhoneProps {
    currentView: SharedValue<number>;
    sceneWidth: number;
    sceneHeight: number;
}
export function Phone({ currentView, sceneWidth, sceneHeight }: PhoneProps) {
    const phoneOriginalWidth = 50;
    const phoneOriginalHeight = 85;
    const phoneDestWidth = sceneWidth * 0.1;
    const phoneDestHeight =
        (phoneDestWidth / phoneOriginalWidth) * phoneOriginalHeight;
    const phoneResizeTransform = fitbox(
        "contain",
        rect(0, 0, phoneOriginalWidth, phoneOriginalHeight),
        rect(0, 0, phoneDestWidth, phoneDestHeight),
    );

    const psiphonLogoPng = useImage(
        require("@/assets/images/psiphon-logo.png"),
    );

    const phoneOpacity = useSharedValue(0);
    const turbulenceSeed = useSharedValue(0);

    useAnimatedReaction(
        () => {
            return currentView.value;
        },
        (current, previous) => {
            if (previous === 1) {
                cancelAnimation(turbulenceSeed);
            }
            if (current === 0) {
                phoneOpacity.value = withTiming(0);
                turbulenceSeed.value = 0;
            } else if (current === 1) {
                phoneOpacity.value = withDelay(
                    previous === 0 ? 1400 : 0,
                    withTiming(1, { duration: 800 }),
                );
                turbulenceSeed.value = withRepeat(
                    withTiming(10, { duration: 1000, easing: Easing.steps(5) }),
                    -1,
                    true,
                );
            } else if (current === 2) {
                phoneOpacity.value = withTiming(0, { duration: 500 });
            }
        },
    );

    return (
        <Group opacity={phoneOpacity}>
            <Group
                transform={[
                    { translateY: sceneHeight / 3 },
                    { translateX: sceneWidth * 0.05 },
                ]}
            >
                <Group transform={phoneResizeTransform}>
                    <RoundedRect x={2} y={0} width={48} height={85} r={5}>
                        <Fill color={palette.blue} />
                        <Turbulence
                            freqX={0.5}
                            freqY={0.5}
                            octaves={10}
                            seed={turbulenceSeed}
                        />
                    </RoundedRect>
                    <Path path="M50.3506 5.38172V80.5817C50.3506 80.5817 50.2606 80.6617 50.2506 80.7117C49.5006 84.3017 47.4806 85.9517 43.8106 85.9517C31.4406 85.9517 19.0706 85.9517 6.70057 85.9517C2.91057 85.9517 0.440558 83.5117 0.440558 79.7217C0.440558 55.2217 0.430578 30.7317 0.460578 6.23172C0.460578 5.20172 0.740549 4.11172 1.15055 3.17172C1.95055 1.35172 3.57058 0.481719 5.43058 0.0117188H45.3206C46.8506 0.421719 48.3006 1.02172 49.1406 2.43172C49.6806 3.33172 49.9506 4.39172 50.3506 5.38172ZM46.2106 75.1917V9.28172H4.52058V75.1817H46.2106V75.1917ZM22.5006 80.1017C22.4806 81.7017 23.7206 83.0017 25.3106 83.0517C26.8706 83.1017 28.2106 81.8117 28.2406 80.2317C28.2706 78.5917 27.0006 77.2617 25.3906 77.2517C23.8106 77.2417 22.5106 78.5217 22.5006 80.1117V80.1017ZM25.3706 4.20172C23.4506 4.20172 21.5206 4.20172 19.6006 4.20172C19.0806 4.20172 18.5906 4.27172 18.5906 4.90172C18.5906 5.55172 19.1106 5.59172 19.6106 5.59172C23.4606 5.59172 27.3005 5.59172 31.1505 5.59172C31.6605 5.59172 32.1706 5.54172 32.1606 4.89172C32.1606 4.25172 31.6506 4.19172 31.1406 4.20172C29.2206 4.20172 27.2906 4.20172 25.3706 4.20172Z">
                        <LinearGradient
                            start={vec(25, 86)}
                            end={vec(25, 0)}
                            colors={["#6B536A", "#5C7A90"]}
                        />
                    </Path>
                </Group>
            </Group>
            <Rect
                x={phoneDestWidth * 1.5}
                y={0}
                width={sceneWidth * 0.1}
                height={sceneHeight}
            >
                <LinearGradient
                    start={vec(phoneDestWidth * 1.5, sceneHeight / 2)}
                    end={vec(
                        phoneDestWidth * 1.5 + sceneWidth * 0.1,
                        sceneHeight / 2,
                    )}
                    colors={[palette.transparent, palette.red]}
                />
            </Rect>
            <Group
                transform={[
                    { translateX: sceneWidth / 2 },
                    { translateY: sceneHeight / 2 },
                ]}
            >
                <ConduitConnectionLight
                    active={true}
                    canvasWidth={sceneWidth}
                    orbRadius={sceneHeight / 3}
                    midPoint={vec(0, 0)}
                    secondLastPoint={vec(sceneWidth / 4, 0)}
                    endPoint={vec(sceneWidth / 2 - 25, 0)}
                    randomize={false}
                    x0init={-sceneWidth / 2}
                    y0init={0}
                />
            </Group>
            <Rect
                x={sceneWidth * 0.8}
                y={0}
                height={sceneHeight}
                width={sceneWidth * 0.2}
            >
                <LinearGradient
                    start={vec(sceneWidth * 0.8, 0)}
                    end={vec(sceneWidth, 0)}
                    colors={[palette.transparent, palette.blue]}
                />
            </Rect>
            <Group>
                <Image
                    image={psiphonLogoPng}
                    x={sceneWidth - 50}
                    y={sceneHeight / 2 - 20}
                    width={40}
                    height={40}
                    fit={"contain"}
                />
            </Group>
        </Group>
    );
}

import {
    Circle,
    Group,
    Image,
    RadialGradient,
    Shadow,
    useImage,
    vec,
} from "@shopify/react-native-skia";
import {
    SharedValue,
    cancelAnimation,
    useAnimatedReaction,
    useDerivedValue,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";

import { palette } from "@/src/styles";

interface FlexibleOrbProps {
    currentView: SharedValue<number>;
    sceneWidth: number;
    sceneHeight: number;
}
export function FlexibleOrb({
    currentView,
    sceneHeight,
    sceneWidth,
}: FlexibleOrbProps) {
    const initialRadius = sceneHeight / 4;
    const radius = useSharedValue(initialRadius);
    const cx = useSharedValue(sceneWidth);
    const cy = sceneHeight / 2;

    const orbsWorldPng = useImage(require("@/assets/images/orbs-world.png"));
    const notificationsPng = useImage(
        require("@/assets/images/onboarding-permissions.png"),
    );
    const backgroundOpacity = useSharedValue(0);

    const privacyPolicyPng = useImage(
        require("@/assets/images/onboarding-privacy-policy.png"),
    );
    const privacyPolicyOpacity = useSharedValue(0);

    const radialGradientC = useDerivedValue(() => {
        return vec(cx.value, cy);
    });

    const notificationY = useDerivedValue(() => {
        return cy - radius.value * 1.2;
    });

    useAnimatedReaction(
        () => {
            return currentView.value;
        },
        (current, previous) => {
            if (previous === 0) {
                cancelAnimation(radius);
            }
            if (previous === 1) {
                radius.value = initialRadius;
            }
            if (current === 0) {
                cx.value = withTiming(sceneWidth * 0.5);
                radius.value = withDelay(
                    1000,
                    withRepeat(
                        withSequence(
                            withTiming(initialRadius * 1.2, { duration: 300 }),
                            withSpring(initialRadius, {
                                duration: 1400,
                                dampingRatio: 0.3,
                                stiffness: 100,
                                restDisplacementThreshold: 0.01,
                                //restSpeedThreshold: 2,
                            }),
                        ),
                        -1,
                        false,
                    ),
                );
            } else if (current === 1) {
                radius.value = withSpring(sceneHeight / 2.5, {
                    mass: 5.2,
                    damping: 10,
                    stiffness: 100,
                    restDisplacementThreshold: 0.01,
                    restSpeedThreshold: 2,
                });
                cx.value = withDelay(
                    500,
                    withSpring(sceneWidth * 0.6, {
                        mass: 5.2,
                        damping: 10,
                        stiffness: 100,
                        restDisplacementThreshold: 0.01,
                        restSpeedThreshold: 2,
                    }),
                );
                backgroundOpacity.value = withTiming(0, { duration: 300 });
            } else if (current === 2) {
                cx.value = withSpring(sceneWidth * 0.3, {
                    mass: 3.2,
                    damping: 10,
                    stiffness: 100,
                    restDisplacementThreshold: 0.01,
                    restSpeedThreshold: 2,
                });
                radius.value = withSpring(sceneHeight / 3.5, {
                    mass: 2.2,
                    damping: 20,
                    stiffness: 100,
                    restDisplacementThreshold: 0.01,
                    restSpeedThreshold: 2,
                });
                backgroundOpacity.value = withTiming(1, { duration: 1000 });
                privacyPolicyOpacity.value = withTiming(0);
            } else if (current === 3) {
                backgroundOpacity.value = withTiming(0);
                privacyPolicyOpacity.value = withTiming(1, { duration: 1000 });
            }
        },
    );

    return (
        <Group>
            <Image
                image={orbsWorldPng}
                x={0}
                y={0}
                width={sceneWidth}
                height={sceneHeight}
                fit={"contain"}
                opacity={backgroundOpacity}
            />
            <Image
                image={privacyPolicyPng}
                x={sceneWidth * 0.55}
                y={sceneHeight / 4}
                width={sceneWidth / 4}
                height={sceneHeight / 2}
                fit={"contain"}
                opacity={privacyPolicyOpacity}
            />
            <Circle cx={cx} cy={cy} r={radius}>
                <Shadow
                    dx={10}
                    dy={10}
                    blur={10}
                    color={palette.purple}
                    inner
                />
                <Shadow
                    dx={-10}
                    dy={-10}
                    blur={10}
                    color={palette.blue}
                    inner
                />
                <RadialGradient
                    c={radialGradientC}
                    r={radius}
                    colors={[palette.red, palette.black]}
                />
            </Circle>
            <Image
                image={notificationsPng}
                x={cx}
                y={notificationY}
                width={sceneWidth / 5}
                height={sceneHeight / 3}
                fit={"contain"}
                opacity={backgroundOpacity}
            />
        </Group>
    );
}

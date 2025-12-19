/*
 * Copyright (c) 2024, Psiphon Inc.
 * All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */
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
            if (previous === 1 && current === 0) {
                radius.value = initialRadius;
            }
            if (previous === 2) {
                privacyPolicyOpacity.value = withTiming(0, { duration: 1000 });
            }
            if (previous === 3) {
                backgroundOpacity.value = withTiming(0);
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
            } else if (current === 2) {
                privacyPolicyOpacity.value = withTiming(1, { duration: 1000 });
                radius.value = withSpring(sceneHeight / 4.5, {
                    mass: 2.2,
                    damping: 20,
                    stiffness: 100,
                    restDisplacementThreshold: 0.01,
                    restSpeedThreshold: 2,
                });
                cx.value = withSpring(sceneWidth * 0.3, {
                    mass: 3.2,
                    damping: 10,
                    stiffness: 100,
                    restDisplacementThreshold: 0.01,
                    restSpeedThreshold: 2,
                });
            } else if (current === 3) {
                radius.value = withSpring(sceneHeight / 3.5, {
                    mass: 2.2,
                    damping: 20,
                    stiffness: 100,
                    restDisplacementThreshold: 0.01,
                    restSpeedThreshold: 2,
                });
                backgroundOpacity.value = withTiming(1, { duration: 1000 });
            }
        },
    );

    return (
        <Group>
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
                <Shadow dx={10} dy={10} blur={10} color={palette.mauve} inner />
                <Shadow
                    dx={-10}
                    dy={-10}
                    blur={10}
                    color={palette.peach}
                    inner
                />
                <RadialGradient
                    c={radialGradientC}
                    r={radius}
                    colors={[palette.fadedMauve, palette.purple]}
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

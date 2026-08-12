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
import { Image as ExpoImage } from "expo-image";
import React from "react";
import Animated, {
    SharedValue,
    cancelAnimation,
    useAnimatedReaction,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";

import {
    InnerShadowLayer,
    OrbBodyGradient,
} from "@/src/components/orb-scene/native/orbLayers";
import { palette } from "@/src/styles";

interface FlexibleOrbProps {
    currentView: SharedValue<number>;
    sceneWidth: number;
    sceneHeight: number;
}

/**
 * The onboarding orb, rendered from the shared native layers: a static
 * radial-gradient body plus offset inner-shadow tints in a wrapper that
 * animates position and scale. The per-view springs are unchanged from the
 * Skia version; only the paint moved.
 */
export function FlexibleOrb({
    currentView,
    sceneHeight,
    sceneWidth,
}: FlexibleOrbProps) {
    const initialRadius = sceneHeight / 4;
    // Largest spring target across views, with bounce overshoot headroom;
    // the wrapper renders at this size and scales down.
    const baseRadius = sceneHeight / 2.5;
    const radius = useSharedValue(initialRadius);
    const cx = useSharedValue(sceneWidth);
    const cy = sceneHeight / 2;

    const backgroundOpacity = useSharedValue(0);
    const privacyPolicyOpacity = useSharedValue(0);

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
            if (previous === 3) {
                privacyPolicyOpacity.value = withTiming(0, { duration: 1000 });
            }
            if (previous === 4) {
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
                                duration: 933,
                                dampingRatio: 0.3,
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
                });
                cx.value = withDelay(
                    500,
                    withSpring(sceneWidth * 0.6, {
                        mass: 5.2,
                        damping: 10,
                        stiffness: 100,
                    }),
                );
            } else if (current === 2) {
                // HOSTED CONDUIT: orb settles to medium size, centered
                radius.value = withSpring(sceneHeight / 3, {
                    mass: 3.2,
                    damping: 15,
                    stiffness: 100,
                });
                cx.value = withSpring(sceneWidth * 0.5, {
                    mass: 3.2,
                    damping: 15,
                    stiffness: 100,
                });
            } else if (current === 3) {
                privacyPolicyOpacity.value = withTiming(1, { duration: 1000 });
                radius.value = withSpring(sceneHeight / 4.5, {
                    mass: 2.2,
                    damping: 20,
                    stiffness: 100,
                });
                cx.value = withSpring(sceneWidth * 0.3, {
                    mass: 3.2,
                    damping: 10,
                    stiffness: 100,
                });
            } else if (current === 4) {
                radius.value = withSpring(sceneHeight / 3.5, {
                    mass: 2.2,
                    damping: 20,
                    stiffness: 100,
                });
                backgroundOpacity.value = withTiming(1, { duration: 1000 });
            }
        },
    );

    const orbStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { translateX: cx.value - baseRadius },
                { translateY: cy - baseRadius },
                { scale: radius.value / baseRadius },
            ],
        };
    }, [baseRadius, cx, cy, radius]);

    const privacyPolicyStyle = useAnimatedStyle(
        () => ({ opacity: privacyPolicyOpacity.value }),
        [privacyPolicyOpacity],
    );

    const notificationStyle = useAnimatedStyle(() => {
        return {
            opacity: backgroundOpacity.value,
            transform: [
                { translateX: cx.value },
                { translateY: cy - radius.value * 1.2 },
            ],
        };
    }, [backgroundOpacity, cx, cy, radius]);

    return (
        <>
            <Animated.View
                pointerEvents="none"
                style={[
                    {
                        position: "absolute",
                        left: sceneWidth * 0.55,
                        top: sceneHeight / 4,
                        width: sceneWidth / 4,
                        height: sceneHeight / 2,
                    },
                    privacyPolicyStyle,
                ]}
            >
                <ExpoImage
                    source={require("@/assets/images/onboarding-privacy-policy.png")}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="contain"
                />
            </Animated.View>
            <Animated.View
                pointerEvents="none"
                style={[
                    {
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: baseRadius * 2,
                        height: baseRadius * 2,
                        overflow: "visible",
                    },
                    orbStyle,
                ]}
            >
                <OrbBodyGradient
                    id="onboarding-orb-body"
                    radius={baseRadius}
                    innerColor={palette.fadedMauve}
                    outerColor={palette.purple}
                />
                <InnerShadowLayer
                    id="onboarding-orb-shadow-mauve"
                    radius={baseRadius}
                    color={palette.mauve}
                    dx={10}
                    dy={10}
                />
                <InnerShadowLayer
                    id="onboarding-orb-shadow-peach"
                    radius={baseRadius}
                    color={palette.peach}
                    dx={-10}
                    dy={-10}
                />
            </Animated.View>
            <Animated.View
                pointerEvents="none"
                style={[
                    {
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: sceneWidth / 5,
                        height: sceneHeight / 3,
                    },
                    notificationStyle,
                ]}
            >
                <ExpoImage
                    source={require("@/assets/images/onboarding-permissions.png")}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="contain"
                />
            </Animated.View>
        </>
    );
}

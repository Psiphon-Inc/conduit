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
import { View } from "react-native";
import Animated, {
    Easing,
    SharedValue,
    cancelAnimation,
    useAnimatedReaction,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import {
    CHAIN_LEFT_DETAIL,
    CHAIN_LEFT_FILL,
    CHAIN_RIGHT_DETAIL,
    CHAIN_RIGHT_FILL,
    NOTCH_LEFT_A,
    NOTCH_LEFT_B,
    NOTCH_RIGHT_A,
    NOTCH_RIGHT_B,
} from "@/src/components/canvas/chainPaths";
import { palette } from "@/src/styles";

const CHAIN_VIEW_WIDTH = 101;
const CHAIN_VIEW_HEIGHT = 62;
const NOTCH_VIEW_WIDTH = 20;
const NOTCH_VIEW_HEIGHT = 15;

function ChainPiece({
    width,
    height,
    fillPath,
    detailPath,
}: {
    width: number;
    height: number;
    fillPath: string;
    detailPath: string;
}) {
    return (
        <Svg
            width={width}
            height={height}
            viewBox={`0 0 ${CHAIN_VIEW_WIDTH} ${CHAIN_VIEW_HEIGHT}`}
            style={{ overflow: "visible" }}
        >
            <Path d={fillPath} fill={palette.white} />
            <Path d={detailPath} fill={palette.purple} />
        </Svg>
    );
}

/**
 * The onboarding chain-break scene on react-native-svg. Whole chain pieces
 * animate via wrapper transforms (the Skia version already worked this way);
 * the Skia transforms acted about the piece's top-left origin, so wrappers
 * sandwich the animated transform between pivot-correction translations.
 */
export function Chains({
    size,
    sceneWidth,
    sceneHeight,
    currentView,
}: {
    size: number;
    sceneWidth: number;
    sceneHeight: number;
    currentView: SharedValue<number>;
}) {
    const chainDestWidth = size;
    const chainDestHeight =
        (chainDestWidth / CHAIN_VIEW_WIDTH) * CHAIN_VIEW_HEIGHT;

    const breaker = useSharedValue(0);
    const opacity = useSharedValue(1);

    const notchDestWidth = size / 6;
    const notchDestHeight =
        (notchDestWidth / NOTCH_VIEW_WIDTH) * NOTCH_VIEW_HEIGHT;
    const notchesOpacity = useSharedValue(0);
    const notchesSlider = useSharedValue(0);

    useAnimatedReaction(
        () => {
            return currentView.value;
        },
        (current, previous) => {
            if (previous === 0) {
                cancelAnimation(breaker);
            }
            if (previous === 1) {
                breaker.value = 0;
                opacity.value = 0;
            }
            if (current === 0) {
                breaker.value = withDelay(
                    1000,
                    withRepeat(
                        withSequence(
                            withTiming(0.05, {
                                duration: 300,
                                easing: Easing.in(Easing.bounce),
                            }),
                            withTiming(0, {
                                duration: 300,
                                easing: Easing.in(Easing.bounce),
                            }),
                            withTiming(0, { duration: 1100 }),
                        ),
                        -1,
                        true,
                    ),
                );
                opacity.value = withTiming(1);
                notchesOpacity.value = 0;
                notchesSlider.value = 0;
            } else if (current === 1) {
                breaker.value = withTiming(1, {
                    duration: 1000,
                    easing: Easing.in(Easing.bezierFn(0.25, 0.11, 0.9, -0.44)),
                });
                opacity.value = withTiming(0, {
                    duration: 1050,
                    easing: Easing.circle,
                });
                if (previous === 0) {
                    notchesOpacity.value = withSequence(
                        withDelay(500, withTiming(1)),
                        withTiming(0, { duration: 500 }),
                    );
                    notchesSlider.value = withDelay(
                        500,
                        withTiming(1, { duration: 500 }),
                    );
                }
            }
        },
    );

    const halfWidth = chainDestWidth / 2;
    const halfHeight = chainDestHeight / 2;

    const chainsOpacityStyle = useAnimatedStyle(
        () => ({ opacity: opacity.value }),
        [opacity],
    );

    // Pivot sandwich: the Skia transforms acted about the top-left origin,
    // React Native transforms act about the view center.
    const animatedStyleL = useAnimatedStyle(() => {
        return {
            transform: [
                { translateX: -halfWidth },
                { translateY: -halfHeight },
                { rotate: `${-0.42 + breaker.value / 2}rad` },
                { skewX: `${0.5 * breaker.value}rad` },
                { skewY: `${-0.2 * breaker.value}rad` },
                { translateX: halfWidth },
                { translateY: halfHeight },
            ],
        };
    }, [breaker, halfHeight, halfWidth]);

    const animatedStyleR = useAnimatedStyle(() => {
        return {
            transform: [
                { translateX: -halfWidth },
                { translateY: -halfHeight },
                { rotate: `${0.4 - breaker.value / 2}rad` },
                {
                    translateX: size - size / 7 + (breaker.value * size) / 3,
                },
                {
                    translateY:
                        -(size - size / 6.4) + breaker.value * size * 1.3,
                },
                { translateX: halfWidth },
                { translateY: halfHeight },
            ],
        };
    }, [breaker, halfHeight, halfWidth, size]);

    const notchesStyle = useAnimatedStyle(() => {
        return {
            opacity: notchesOpacity.value,
            transform: [
                { translateX: sceneWidth / 2 + 12 },
                {
                    translateY:
                        sceneHeight / 5 +
                        (sceneHeight / 5) * notchesSlider.value,
                },
            ],
        };
    }, [notchesOpacity, notchesSlider, sceneHeight, sceneWidth]);

    // The Skia version translated the left notch pair by -size/3 inside the
    // notch scale transform; replicate the effective screen offset.
    const notchScale = notchDestWidth / NOTCH_VIEW_WIDTH;
    const leftNotchOffset = -(size / 3) * notchScale;

    return (
        <View pointerEvents="none">
            <Animated.View
                style={[
                    {
                        position: "absolute",
                        left: (sceneWidth - size * 2) / 2,
                        top: 0,
                    },
                    chainsOpacityStyle,
                ]}
            >
                <Animated.View
                    style={[
                        {
                            position: "absolute",
                            width: chainDestWidth,
                            height: chainDestHeight,
                            overflow: "visible",
                        },
                        animatedStyleL,
                    ]}
                >
                    <ChainPiece
                        width={chainDestWidth}
                        height={chainDestHeight}
                        fillPath={CHAIN_LEFT_FILL}
                        detailPath={CHAIN_LEFT_DETAIL}
                    />
                </Animated.View>
                <Animated.View
                    style={[
                        {
                            position: "absolute",
                            width: chainDestWidth,
                            height: chainDestHeight,
                            overflow: "visible",
                        },
                        animatedStyleR,
                    ]}
                >
                    <ChainPiece
                        width={chainDestWidth}
                        height={chainDestHeight}
                        fillPath={CHAIN_RIGHT_FILL}
                        detailPath={CHAIN_RIGHT_DETAIL}
                    />
                </Animated.View>
            </Animated.View>
            <Animated.View
                style={[
                    { position: "absolute", left: 0, top: 0 },
                    notchesStyle,
                ]}
            >
                <Svg
                    width={notchDestWidth}
                    height={notchDestHeight}
                    viewBox={`0 0 ${NOTCH_VIEW_WIDTH} ${NOTCH_VIEW_HEIGHT}`}
                >
                    <Path d={NOTCH_RIGHT_A} fill={palette.purple} />
                    <Path d={NOTCH_RIGHT_B} fill={palette.purple} />
                </Svg>
                <Svg
                    width={notchDestWidth}
                    height={notchDestHeight}
                    viewBox={`0 0 ${NOTCH_VIEW_WIDTH} ${NOTCH_VIEW_HEIGHT}`}
                    style={{
                        position: "absolute",
                        left: leftNotchOffset,
                        top: 0,
                    }}
                >
                    <Path d={NOTCH_LEFT_A} fill={palette.purple} />
                    <Path d={NOTCH_LEFT_B} fill={palette.purple} />
                </Svg>
            </Animated.View>
        </View>
    );
}

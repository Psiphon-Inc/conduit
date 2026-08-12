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
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    clamp,
    runOnJS,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
} from "react-native-reanimated";

import { AnimatedText } from "@/src/components/AnimatedText";
import { lineItemStyle, palette, sharedStyles as ss } from "@/src/styles";

interface EditableNumberSliderProps {
    label: string;
    originalValue: number;
    min: number;
    max: number;
    units?: string;
    style?: any;
    onChange: (newValue: number) => Promise<void>;
    scrollRef: RefObject<any>;
}

export function sliderFillWidth(
    thumbCenterX: number,
    trackLeft: number,
    trackWidth: number,
): number {
    "worklet";
    return Math.max(0, Math.min(trackWidth, thumbCenterX - trackLeft));
}

export function EditableNumberSlider({
    label,
    originalValue,
    min,
    max,
    units = "",
    style = lineItemStyle,
    onChange,
    scrollRef,
}: EditableNumberSliderProps) {
    const { i18n } = useTranslation();
    const isRTL = i18n.dir() === "rtl" ? true : false;

    const value = useSharedValue(originalValue);
    const displayText = useDerivedValue(() => {
        const changed = value.value === originalValue ? " " : "*";
        return `${value.value}` + changed;
    });

    const canvasSize = useSharedValue({ width: 0, height: 0 });

    const onSliderLayout = React.useCallback(
        (event: LayoutChangeEvent) => {
            const { width, height } = event.nativeEvent.layout;
            if (
                width > 0 &&
                height > 0 &&
                (canvasSize.value.width !== width ||
                    canvasSize.value.height !== height)
            ) {
                canvasSize.value = { width, height };
            }
        },
        [canvasSize],
    );

    // The circle to slide
    const circleR = useDerivedValue(() => {
        return canvasSize.value.height / 4;
    });
    const usableWidth = useDerivedValue(() => {
        return canvasSize.value.width - circleR.value * 2;
    });
    const prevCircleCxPct = useSharedValue(0);
    const circleCxPct = useSharedValue(
        ((originalValue - min) / (max - min)) * 100,
    );

    React.useEffect(() => {
        const range = max - min;
        if (range <= 0) {
            value.value = min;
            circleCxPct.value = 0;
            prevCircleCxPct.value = 0;
            return;
        }
        const clampedOriginal = Math.min(max, Math.max(min, originalValue));
        value.value = clampedOriginal;
        const nextPct = ((clampedOriginal - min) / range) * 100;
        circleCxPct.value = nextPct;
        prevCircleCxPct.value = nextPct;
    }, [circleCxPct, max, min, originalValue, prevCircleCxPct, value]);

    const circleCx = useDerivedValue(() => {
        // offset circleX by 2x circleR so that it fits nicely in the bar
        const effectiveUsableWidth = usableWidth.value - circleR.value * 2;
        const newValue =
            circleR.value * 2 +
            (circleCxPct.value / 100) * effectiveUsableWidth;
        return newValue;
    });

    const trackStyle = useAnimatedStyle(() => {
        const height = circleR.value * 2;
        return {
            position: "absolute" as const,
            left: circleR.value,
            top: canvasSize.value.height / 4,
            width: usableWidth.value,
            height,
            borderRadius: circleR.value,
            backgroundColor: palette.black,
            borderWidth: 1,
            borderColor: palette.midGrey,
            overflow: "hidden" as const,
        };
    }, [canvasSize, circleR, usableWidth]);

    // The filled portion clips a full-width gradient to the thumb position.
    const filledClipStyle = useAnimatedStyle(
        () => ({
            width: sliderFillWidth(
                circleCx.value,
                circleR.value,
                usableWidth.value,
            ),
        }),
        [circleCx, circleR, usableWidth],
    );
    const filledGradientStyle = useAnimatedStyle(
        () => ({ width: usableWidth.value }),
        [usableWidth],
    );

    const thumbStyle = useAnimatedStyle(() => {
        const radius = circleR.value;
        return {
            position: "absolute" as const,
            left: circleCx.value - radius,
            top: canvasSize.value.height / 2 - radius,
            width: radius * 2,
            height: radius * 2,
            borderRadius: radius,
            backgroundColor: palette.white,
            borderWidth: 1,
            borderColor: palette.purple,
        };
    }, [canvasSize, circleCx, circleR]);

    const sliderGesture = Gesture.Pan()
        .blocksExternalGesture(scrollRef)
        .minDistance(0)
        .onStart(() => {
            runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Soft);
            prevCircleCxPct.value = circleCxPct.value;
        })
        .onUpdate((event) => {
            const rtl = isRTL ? -1 : 1;
            const newCircleCxPct = clamp(
                prevCircleCxPct.value +
                    ((rtl * event.translationX) / usableWidth.value) * 100,
                0,
                100,
            );
            circleCxPct.value = newCircleCxPct;
            value.value =
                min + Math.round((newCircleCxPct / 100) * (max - min));
            runOnJS(onChange)(value.value);
        });

    return (
        <View style={[...style, ss.flex, ss.justifySpaceBetween]}>
            <Text style={[ss.bodyFont, ss.blackText]}>{label}</Text>
            <View style={[ss.row, ss.flex, { maxWidth: 180 }]}>
                <View
                    onLayout={onSliderLayout}
                    style={[ss.flex, isRTL ? { transform: "scaleX(-1)" } : {}]}
                >
                    <Animated.View style={trackStyle}>
                        <Animated.View
                            style={[
                                StyleSheet.absoluteFill,
                                { overflow: "hidden" },
                                filledClipStyle,
                            ]}
                        >
                            <Animated.View
                                style={[
                                    { height: "100%" },
                                    filledGradientStyle,
                                ]}
                            >
                                <LinearGradient
                                    style={StyleSheet.absoluteFill}
                                    start={{ x: 0, y: 0.5 }}
                                    end={{ x: 1, y: 0.5 }}
                                    colors={[
                                        palette.mauve,
                                        palette.peachyMauve,
                                        palette.peach,
                                    ]}
                                />
                            </Animated.View>
                        </Animated.View>
                    </Animated.View>
                    <Animated.View style={thumbStyle} />
                    <GestureDetector gesture={sliderGesture}>
                        <Animated.View style={StyleSheet.absoluteFill} />
                    </GestureDetector>
                </View>
                <View style={[ss.row, ss.alignCenter]}>
                    <View style={[ss.row, ss.alignCenter, ss.nogap]}>
                        <View
                            style={[
                                ss.circle38,
                                ss.justifyCenter,
                                ss.alignCenter,
                            ]}
                        >
                            <AnimatedText
                                text={displayText}
                                fontFamily={ss.boldFont.fontFamily}
                                fontSize={ss.boldFont.fontSize}
                                color={palette.black}
                            />
                        </View>
                        <Text style={[ss.bodyFont, ss.blackText]}>{units}</Text>
                    </View>
                </View>
            </View>
        </View>
    );
}

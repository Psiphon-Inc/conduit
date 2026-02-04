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
    Canvas,
    Circle,
    LinearGradient,
    RoundedRect,
    vec,
} from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import React, { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
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

    // The Circle to slide
    const circleR = useDerivedValue(() => {
        return canvasSize.value.height / 4;
    });
    const outlineWidth = useSharedValue(1);
    const usableWidth = useDerivedValue(() => {
        return canvasSize.value.width - circleR.value * 2;
    });
    const prevCircleCxPct = useSharedValue(0);
    const circleCxPct = useSharedValue(
        ((originalValue - min) / (max - min)) * 100,
    );
    const circleCx = useDerivedValue(() => {
        // offset circleX by 2x circleR so that it fits nicely in the bar
        const effectiveUsableWidth = usableWidth.value - circleR.value * 2;
        const newValue =
            circleR.value * 2 +
            (circleCxPct.value / 100) * effectiveUsableWidth;
        return newValue;
    });
    const circleCy = useDerivedValue(() => {
        return canvasSize.value.height / 2;
    });

    // track area
    const trackHeight = useDerivedValue(() => {
        return circleR.value * 2;
    });
    const trackY = useDerivedValue(() => {
        return circleCy.value / 2;
    });
    const filledStart = useDerivedValue(() => {
        return vec(circleR.value, circleCy.value);
    });
    const filledEnd = useDerivedValue(() => {
        return vec(circleR.value + usableWidth.value, circleCy.value);
    });

    // Overlay for GestureDetector
    const overlayStyle = useAnimatedStyle(() => ({
        flex: 1,
        position: "absolute",
        width: "100%",
        height: "100%",
    }));

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
                    style={[ss.flex, isRTL ? { transform: "scaleX(-1)" } : {}]}
                >
                    <Canvas style={[ss.flex]} onSize={canvasSize}>
                        <RoundedRect
                            x={circleR}
                            y={trackY}
                            width={usableWidth}
                            height={trackHeight}
                            style="fill"
                            color={palette.black}
                            r={circleR}
                        />
                        <RoundedRect
                            x={circleR}
                            y={trackY}
                            width={circleCx}
                            height={trackHeight}
                            style="fill"
                            color={palette.peach}
                            r={circleR}
                        >
                            <LinearGradient
                                start={filledStart}
                                end={filledEnd}
                                colors={[
                                    palette.mauve,
                                    palette.peachyMauve,
                                    palette.peach,
                                ]}
                            />
                        </RoundedRect>
                        <RoundedRect
                            x={circleR}
                            y={trackY}
                            width={usableWidth}
                            height={trackHeight}
                            style="stroke"
                            strokeWidth={outlineWidth}
                            color={palette.midGrey}
                            r={circleR}
                        />
                        <Circle
                            cx={circleCx}
                            cy={circleCy}
                            r={circleR}
                            style="fill"
                            color={palette.white}
                        />
                        <Circle
                            cx={circleCx}
                            cy={circleCy}
                            r={circleR}
                            style="stroke"
                            strokeWidth={1}
                            color={palette.purple}
                        />
                    </Canvas>
                    <GestureDetector gesture={sliderGesture}>
                        <Animated.View style={[overlayStyle]} />
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

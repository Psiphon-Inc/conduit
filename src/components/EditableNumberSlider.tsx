import {
    Canvas,
    Circle,
    LinearGradient,
    RoundedRect,
    vec,
} from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import React from "react";
import { Text, View } from "react-native";
import Animated, {
    clamp,
    runOnJS,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
} from "react-native-reanimated";

import { lineItemStyle, palette, sharedStyles as ss } from "@/src/styles";
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
} from "react-native-gesture-handler";
import { AnimatedText } from "./AnimatedText";

interface EditableNumberSliderProps {
    label: string;
    originalValue: number;
    min: number;
    max: number;
    units?: string;
    style?: any;
    onChange: (newValue: number) => Promise<void>;
}
export function EditableNumberSlider({
    label,
    originalValue,
    min,
    max,
    units = "",
    style = lineItemStyle,
    onChange,
}: EditableNumberSliderProps) {
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
        Math.round(value.value / (max - min)) * 100,
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
    const overlaySize = useDerivedValue(() => circleR.value * 5);
    const overlayTransform = useDerivedValue(() => {
        return [
            {
                translateX: circleCx.value - circleR.value * 2.5,
            },
            {
                translateY: circleCy.value - circleR.value * 2,
            },
        ];
    });
    const overlayStyle = useAnimatedStyle(() => ({
        position: "absolute",
        flex: 1,
        height: overlaySize.value,
        width: overlaySize.value,
        transform: overlayTransform.value,
    }));

    const sliderGesture = Gesture.Pan()
        .minDistance(0)
        .onStart(() => {
            runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Soft);
            prevCircleCxPct.value = circleCxPct.value;
        })
        .onUpdate((event) => {
            const newCircleCxPct = clamp(
                prevCircleCxPct.value +
                    (event.translationX / usableWidth.value) * 100,
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
            <Text style={[ss.bodyFont, ss.whiteText]}>{label}</Text>
            <View style={[ss.row, ss.flex, { maxWidth: 180 }]}>
                <GestureHandlerRootView>
                    <View style={[ss.flex]}>
                        <Canvas style={[ss.flex]} onSize={canvasSize}>
                            <RoundedRect
                                x={circleR}
                                y={trackY}
                                width={usableWidth}
                                height={trackHeight}
                                style="fill"
                                color={palette.purpleShade4}
                                r={circleR}
                            />
                            <RoundedRect
                                x={circleR}
                                y={trackY}
                                width={circleCx}
                                height={trackHeight}
                                style="fill"
                                color={palette.white}
                                r={circleR}
                            >
                                <LinearGradient
                                    start={filledStart}
                                    end={filledEnd}
                                    colors={[
                                        palette.blueShade2,
                                        palette.purple,
                                        palette.red,
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
                        </Canvas>
                        <GestureDetector gesture={sliderGesture}>
                            <Animated.View style={overlayStyle} />
                        </GestureDetector>
                    </View>
                </GestureHandlerRootView>
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
                                color={palette.white}
                            />
                        </View>
                        <Text style={[ss.bodyFont, ss.whiteText]}>{units}</Text>
                    </View>
                </View>
            </View>
        </View>
    );
}

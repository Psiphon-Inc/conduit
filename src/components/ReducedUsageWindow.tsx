/*
 * Copyright (c) 2026, Psiphon Inc.
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
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    clamp,
    runOnJS,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

import { bytesToMB } from "@/src/common/utils";
import { AnimatedText } from "@/src/components/AnimatedText";
import { EditableNumberSlider } from "@/src/components/EditableNumberSlider";
import { TIME_STEPS, formatTimeIndex } from "@/src/components/reducedUsageTime";
import {
    INPROXY_MAX_CLIENTS_MAX,
    INPROXY_MAX_MBPS_PER_PEER_MAX,
} from "@/src/constants";
import type { InproxyParameters } from "@/src/inproxy/types";
import { lineItemStyle, palette, sharedStyles as ss } from "@/src/styles";

interface ReducedUsageWindowProps {
    reducedExpanded: boolean;
    setReducedExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    reducedTimeError: null | "format" | "range";
    reducedStartIndex: SharedValue<number>;
    reducedEndIndex: SharedValue<number>;
    reducedEnabled: SharedValue<boolean>;
    modifiedReducedStartTime: SharedValue<string>;
    modifiedReducedEndTime: SharedValue<string>;
    inproxyParameters: InproxyParameters;
    updateReducedMaxClients: (newValue: number) => Promise<void>;
    updateReducedLimitBytesPerSecond: (newValue: number) => Promise<void>;
    scrollRef: React.RefObject<any>;
    ensureReducedWindowDefaults: () => void;
    disableReducedWindow: () => void;
    showSelector: boolean;
}

function ReducedUsageWindowSelector({
    startIndex,
    endIndex,
    enabled,
    startTime,
    endTime,
    scrollRef,
}: {
    startIndex: SharedValue<number>;
    endIndex: SharedValue<number>;
    enabled: SharedValue<boolean>;
    startTime: SharedValue<string>;
    endTime: SharedValue<string>;
    scrollRef: React.RefObject<any>;
}) {
    const { t } = useTranslation();
    const segmentWidth = useSharedValue(0);
    const prevStartIndex = useSharedValue(0);
    const prevEndIndex = useSharedValue(0);
    const startDisplayText = useDerivedValue(() => {
        return startTime.value.length > 0 ? startTime.value : "--:--";
    });
    const endDisplayText = useDerivedValue(() => {
        return endTime.value.length > 0 ? endTime.value : "--:--";
    });
    const trackHeight = 14;
    const handleSize = 18;
    const handleOffset = (handleSize - trackHeight) / 2;
    const reducedPrimaryStyle = useAnimatedStyle(() => {
        if (segmentWidth.value <= 0) {
            return { opacity: 0, width: 0, transform: [{ translateX: 0 }] };
        }
        const startValue = startIndex.value;
        const endValue = endIndex.value;
        const isEnabled = enabled.value && startValue !== endValue;
        if (!isEnabled) {
            return { opacity: 0, width: 0, transform: [{ translateX: 0 }] };
        }
        const left = startValue * segmentWidth.value;
        const width =
            startValue < endValue
                ? (endValue - startValue) * segmentWidth.value
                : (TIME_STEPS - startValue) * segmentWidth.value;
        return {
            opacity: width > 0 ? 1 : 0,
            width,
            transform: [{ translateX: left }],
        };
    });
    const reducedSecondaryStyle = useAnimatedStyle(() => {
        if (segmentWidth.value <= 0) {
            return { opacity: 0, width: 0, transform: [{ translateX: 0 }] };
        }
        const startValue = startIndex.value;
        const endValue = endIndex.value;
        const isEnabled = enabled.value && startValue !== endValue;
        if (!isEnabled || startValue < endValue) {
            return { opacity: 0, width: 0, transform: [{ translateX: 0 }] };
        }
        const width = endValue * segmentWidth.value;
        return {
            opacity: width > 0 ? 1 : 0,
            width,
            transform: [{ translateX: 0 }],
        };
    });
    const startHandleStyle = useAnimatedStyle(() => {
        const offset =
            segmentWidth.value * startIndex.value +
            segmentWidth.value / 2 -
            handleSize / 2;
        return {
            opacity: segmentWidth.value > 0 ? 1 : 0,
            transform: [{ translateX: offset }],
        };
    });
    const endHandleStyle = useAnimatedStyle(() => {
        const offset =
            segmentWidth.value * endIndex.value +
            segmentWidth.value / 2 -
            handleSize / 2;
        return {
            opacity: segmentWidth.value > 0 ? 1 : 0,
            transform: [{ translateX: offset }],
        };
    });
    const startHandleGesture = Gesture.Pan()
        .blocksExternalGesture(scrollRef)
        .minDistance(0)
        .hitSlop({ top: 10, bottom: 10, left: 10, right: 10 })
        .onStart(() => {
            runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Soft);
            prevStartIndex.value = startIndex.value;
            enabled.value = true;
        })
        .onUpdate((event) => {
            if (segmentWidth.value <= 0) {
                return;
            }
            const delta = Math.round(event.translationX / segmentWidth.value);
            const nextIndex = clamp(
                prevStartIndex.value + delta,
                0,
                TIME_STEPS - 1,
            );
            startIndex.value = nextIndex;
            startTime.value = formatTimeIndex(nextIndex);
        });
    const endHandleGesture = Gesture.Pan()
        .blocksExternalGesture(scrollRef)
        .minDistance(0)
        .hitSlop({ top: 10, bottom: 10, left: 10, right: 10 })
        .onStart(() => {
            runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Soft);
            prevEndIndex.value = endIndex.value;
            enabled.value = true;
        })
        .onUpdate((event) => {
            if (segmentWidth.value <= 0) {
                return;
            }
            const delta = Math.round(event.translationX / segmentWidth.value);
            const nextIndex = clamp(
                prevEndIndex.value + delta,
                0,
                TIME_STEPS - 1,
            );
            endIndex.value = nextIndex;
            endTime.value = formatTimeIndex(nextIndex);
        });

    return (
        <View style={[ss.fullWidth, ss.column, ss.halfGap]}>
            <View style={[ss.row, ss.fullWidth, ss.justifySpaceBetween]}>
                <View style={[ss.column, ss.nogap]}>
                    <Text style={[ss.greyText, ss.tinyFont]}>
                        {t("REDUCED_START_TIME_I18N.string")}
                    </Text>
                    <AnimatedText
                        text={startDisplayText}
                        color={palette.black}
                        fontFamily={ss.boldFont.fontFamily}
                        fontSize={ss.bodyFont.fontSize}
                    />
                </View>
                <View style={[ss.column, ss.nogap, ss.alignFlexEnd]}>
                    <Text style={[ss.greyText, ss.tinyFont]}>
                        {t("REDUCED_END_TIME_I18N.string")}
                    </Text>
                    <AnimatedText
                        text={endDisplayText}
                        color={palette.black}
                        fontFamily={ss.boldFont.fontFamily}
                        fontSize={ss.bodyFont.fontSize}
                    />
                </View>
            </View>
            <View
                style={{
                    width: "100%",
                    height: handleSize + handleOffset * 2,
                    position: "relative",
                }}
                onLayout={(event) => {
                    segmentWidth.value =
                        event.nativeEvent.layout.width / TIME_STEPS;
                }}
            >
                <View
                    style={{
                        width: "100%",
                        height: trackHeight,
                        borderRadius: 8,
                        overflow: "hidden",
                        borderWidth: 1,
                        borderColor: palette.midGrey,
                        backgroundColor: palette.blueTint5,
                        position: "absolute",
                        top: handleOffset,
                    }}
                >
                    <Animated.View
                        style={[
                            {
                                position: "absolute",
                                top: 0,
                                bottom: 0,
                                left: 0,
                                backgroundColor: palette.mauve,
                            },
                            reducedPrimaryStyle,
                        ]}
                    />
                    <Animated.View
                        style={[
                            {
                                position: "absolute",
                                top: 0,
                                bottom: 0,
                                left: 0,
                                backgroundColor: palette.mauve,
                            },
                            reducedSecondaryStyle,
                        ]}
                    />
                </View>
                <GestureDetector gesture={startHandleGesture}>
                    <Animated.View
                        style={[
                            {
                                position: "absolute",
                                top: handleOffset - 2,
                                width: handleSize,
                                height: handleSize,
                                borderRadius: handleSize / 2,
                                borderWidth: 2,
                                borderColor: palette.purple,
                                backgroundColor: palette.white,
                            },
                            startHandleStyle,
                        ]}
                    />
                </GestureDetector>
                <GestureDetector gesture={endHandleGesture}>
                    <Animated.View
                        style={[
                            {
                                position: "absolute",
                                top: handleOffset - 2,
                                width: handleSize,
                                height: handleSize,
                                borderRadius: handleSize / 2,
                                borderWidth: 2,
                                borderColor: palette.peachyMauve,
                                backgroundColor: palette.white,
                            },
                            endHandleStyle,
                        ]}
                    />
                </GestureDetector>
            </View>
            <View style={[ss.row, ss.fullWidth, ss.justifySpaceBetween]}>
                {["0h", "6h", "12h", "18h", "24h"].map((label) => (
                    <Text
                        key={`tick-${label}`}
                        style={[ss.greyText, ss.tinyFont]}
                    >
                        {label}
                    </Text>
                ))}
            </View>
        </View>
    );
}

export function ReducedUsageWindow({
    reducedExpanded,
    setReducedExpanded,
    reducedTimeError,
    reducedStartIndex,
    reducedEndIndex,
    reducedEnabled,
    modifiedReducedStartTime,
    modifiedReducedEndTime,
    inproxyParameters,
    updateReducedMaxClients,
    updateReducedLimitBytesPerSecond,
    scrollRef,
    ensureReducedWindowDefaults,
    disableReducedWindow,
    showSelector,
}: ReducedUsageWindowProps) {
    const { t } = useTranslation();
    const notConfiguredLabel = t("REDUCED_WINDOW_NOT_CONFIGURED_I18N.string");
    const summaryPrefix = t("REDUCED_WINDOW_SUMMARY_PREFIX_I18N.string");
    const summarySuffix = t("REDUCED_WINDOW_SUMMARY_SUFFIX_I18N.string");
    const summaryText = useDerivedValue(() => {
        const startValue = modifiedReducedStartTime.value;
        const endValue = modifiedReducedEndTime.value;
        if (startValue.length === 0 || endValue.length === 0) {
            return notConfiguredLabel;
        }
        return `${summaryPrefix} ${startValue} -> ${endValue} ${summarySuffix}`;
    });
    const reducedErrorText =
        reducedTimeError === "format"
            ? t("REDUCED_TIME_FORMAT_I18N.string")
            : reducedTimeError === "range"
              ? t("REDUCED_TIME_RANGE_I18N.string")
              : null;

    if (!reducedExpanded) {
        return (
            <View
                style={[
                    ss.greyBorderBottom,
                    ss.column,
                    ss.padded,
                    ss.fullWidth,
                    ss.halfGap,
                ]}
            >
                <View
                    style={[
                        ss.row,
                        ss.fullWidth,
                        ss.justifySpaceBetween,
                        ss.alignCenter,
                    ]}
                >
                    <Text style={[ss.bodyFont, ss.blackText]}>
                        {t("REDUCED_USAGE_WINDOW_I18N.string")}
                    </Text>
                    <Pressable
                        onPress={() => {
                            ensureReducedWindowDefaults();
                            setReducedExpanded(true);
                        }}
                        accessibilityLabel={t(
                            "REDUCED_WINDOW_CONFIGURE_I18N.string",
                        )}
                    >
                        <Text style={[ss.bodyFont, ss.blackText]}>...</Text>
                    </Pressable>
                </View>
                <AnimatedText
                    text={summaryText}
                    color={palette.midGrey}
                    fontFamily={ss.tinyFont.fontFamily}
                    fontSize={ss.tinyFont.fontSize}
                />
            </View>
        );
    }

    return (
        <View style={[ss.greyBorderBottom, ss.column, ss.padded, ss.fullWidth]}>
            <View
                style={[
                    ss.row,
                    ss.fullWidth,
                    ss.justifySpaceBetween,
                    ss.alignCenter,
                ]}
            >
                <Text style={[ss.bodyFont, ss.blackText]}>
                    {t("REDUCED_USAGE_WINDOW_I18N.string")}
                </Text>
                <View style={[ss.column, ss.alignFlexEnd, ss.nogap]}>
                    <Pressable onPress={disableReducedWindow}>
                        <Text style={[ss.bodyFont, ss.purpleText]}>-</Text>
                    </Pressable>
                </View>
            </View>
            <Text style={[ss.greyText, ss.bodyFont, { fontSize: 14 }]}>
                {t("REDUCED_WINDOW_DESCRIPTION_I18N.string")}
            </Text>
            {showSelector ? (
                <ReducedUsageWindowSelector
                    startIndex={reducedStartIndex}
                    endIndex={reducedEndIndex}
                    enabled={reducedEnabled}
                    startTime={modifiedReducedStartTime}
                    endTime={modifiedReducedEndTime}
                    scrollRef={scrollRef}
                />
            ) : (
                <View style={[ss.fullWidth, ss.height100]} />
            )}
            <View style={[ss.fullWidth, ss.halfPadded]}>
                {reducedErrorText && (
                    <Text style={[ss.tinyFont, { color: palette.peachyMauve }]}>
                        {reducedErrorText}
                    </Text>
                )}
            </View>
            <View
                style={{
                    gap: 0,
                    padding: 0,
                }}
            >
                <EditableNumberSlider
                    label={t("MAX_PEERS_I18N.string")}
                    originalValue={
                        inproxyParameters.reducedMaxClients ??
                        inproxyParameters.maxClients
                    }
                    min={1}
                    max={INPROXY_MAX_CLIENTS_MAX}
                    style={[...lineItemStyle, { borderBottomWidth: 0 }]}
                    onChange={updateReducedMaxClients}
                    scrollRef={scrollRef}
                />
                <EditableNumberSlider
                    label={t("MAX_MBPS_PER_PEER_I18N.string")}
                    originalValue={bytesToMB(
                        inproxyParameters.reducedLimitUpstreamBytesPerSecond ??
                            inproxyParameters.limitUpstreamBytesPerSecond,
                    )}
                    min={2}
                    max={INPROXY_MAX_MBPS_PER_PEER_MAX}
                    style={[...lineItemStyle, { borderBottomWidth: 0 }]}
                    onChange={updateReducedLimitBytesPerSecond}
                    scrollRef={scrollRef}
                />
            </View>
        </View>
    );
}

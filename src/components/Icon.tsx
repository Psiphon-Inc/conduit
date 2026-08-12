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
import { Image as ExpoImage, ImageSource } from "expo-image";
import React from "react";
import { Text, View } from "react-native";
import Animated, {
    SharedValue,
    useAnimatedStyle,
} from "react-native-reanimated";

import { sharedStyles as ss } from "@/src/styles";

const ICONS: Record<IconName, ImageSource> = {
    check: require("@/assets/images/icons/check.svg"),
    close: require("@/assets/images/icons/close.svg"),
    "chevron-down": require("@/assets/images/icons/chevron-down.svg"),
    "chevron-right": require("@/assets/images/icons/chevron-right.svg"),
    copy: require("@/assets/images/icons/copy.svg"),
    edit: require("@/assets/images/icons/edit.svg"),
    send: require("@/assets/images/icons/send.svg"),
    home: require("@/assets/images/icons/home.svg"),
    settings: require("@/assets/images/icons/settings.svg"),
    question: require("@/assets/images/icons/question.svg"),
    "external-link": require("@/assets/images/icons/external-link.svg"),
    analytics: require("@/assets/images/icons/analytics.svg"),
    notepad: require("@/assets/images/icons/notepad.svg"),
    "right-arrow": require("@/assets/images/icons/right-arrow.svg"),
    shield: require("@/assets/images/icons/shield.svg"),
    speaker: require("@/assets/images/icons/speaker.svg"),
};

type IconName =
    | "check"
    | "close"
    | "chevron-down"
    | "chevron-right"
    | "copy"
    | "edit"
    | "send"
    | "home"
    | "settings"
    | "question"
    | "external-link"
    | "analytics"
    | "notepad"
    | "shield"
    | "right-arrow"
    | "speaker";

function FadingIconImage({
    source,
    size,
    color,
    opacity,
}: {
    source: ImageSource;
    size: number;
    color: string;
    opacity: SharedValue<number>;
}) {
    const fadeStyle = useAnimatedStyle(
        () => ({ opacity: opacity.value }),
        [opacity],
    );

    return (
        <Animated.View style={fadeStyle}>
            <ExpoImage
                source={source}
                tintColor={color}
                style={{ width: size, height: size }}
                contentFit="contain"
            />
        </Animated.View>
    );
}

export function Icon({
    name,
    size,
    color,
    opacity = undefined,
    label = undefined,
}: {
    name: IconName;
    size: number;
    color: string;
    opacity?: SharedValue<number> | undefined;
    label?: string | undefined;
}) {
    const source = ICONS[name];
    const content =
        opacity === undefined ? (
            <ExpoImage
                source={source}
                tintColor={color}
                style={{ width: size, height: size }}
                contentFit="contain"
            />
        ) : (
            <FadingIconImage
                source={source}
                size={size}
                color={color}
                opacity={opacity}
            />
        );

    return (
        <View
            style={{
                justifyContent: "flex-start",
                alignItems: "center",
                width: label ? size * 2 : size,
                height: label ? size * 2 : size,
            }}
        >
            <View style={{ width: size, height: size }}>{content}</View>
            {label && (
                <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    style={[ss.bodyFont, ss.blackText, { fontSize: 14 }]}
                >
                    {label}
                </Text>
            )}
        </View>
    );
}

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
    BlendMode,
    Canvas,
    Group,
    ImageSVG,
    Skia,
    fitbox,
    rect,
    useSVG,
} from "@shopify/react-native-skia";
import type { DataSourceParam } from "@shopify/react-native-skia";
import React from "react";
import { Text, View } from "react-native";
import { SharedValue } from "react-native-reanimated";

import { FaderGroup } from "@/src/components/canvas/FaderGroup";
import { sharedStyles as ss } from "@/src/styles";

type IconAsset = {
    source: DataSourceParam;
    // Intrinsic viewBox dimensions — used to build the src rect for fitbox
    // so we never have to call .width()/.height() on the JSI host object at
    // runtime, which can SIGSEGV if the underlying SkSVGDOM is null/disposed.
    viewWidth: number;
    viewHeight: number;
};

const ICONS: Record<IconName, IconAsset> = {
    check: {
        source: require("@/assets/images/icons/check.svg"),
        viewWidth: 24,
        viewHeight: 24,
    },
    close: {
        source: require("@/assets/images/icons/close.svg"),
        viewWidth: 24,
        viewHeight: 24,
    },
    "chevron-down": {
        source: require("@/assets/images/icons/chevron-down.svg"),
        viewWidth: 32,
        viewHeight: 20,
    },
    "chevron-right": {
        source: require("@/assets/images/icons/chevron-right.svg"),
        viewWidth: 8,
        viewHeight: 12,
    },
    copy: {
        source: require("@/assets/images/icons/copy.svg"),
        viewWidth: 21,
        viewHeight: 21,
    },
    edit: {
        source: require("@/assets/images/icons/edit.svg"),
        viewWidth: 32,
        viewHeight: 31,
    },
    send: {
        source: require("@/assets/images/icons/send.svg"),
        viewWidth: 32,
        viewHeight: 32,
    },
    home: {
        source: require("@/assets/images/icons/home.svg"),
        viewWidth: 24,
        viewHeight: 24,
    },
    settings: {
        source: require("@/assets/images/icons/settings.svg"),
        viewWidth: 24,
        viewHeight: 24,
    },
    question: {
        source: require("@/assets/images/icons/question.svg"),
        viewWidth: 36,
        viewHeight: 36,
    },
    "external-link": {
        source: require("@/assets/images/icons/external-link.svg"),
        viewWidth: 19,
        viewHeight: 19,
    },
    analytics: {
        source: require("@/assets/images/icons/analytics.svg"),
        viewWidth: 76,
        viewHeight: 76,
    },
    "right-arrow": {
        source: require("@/assets/images/icons/right-arrow.svg"),
        viewWidth: 13,
        viewHeight: 5,
    },
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
    | "right-arrow";

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
    const { source, viewWidth, viewHeight } = ICONS[name];
    const iconSvg = useSVG(source);
    const paintColor = React.useMemo(() => Skia.Paint(), []);
    paintColor.setColorFilter(
        Skia.ColorFilter.MakeBlend(Skia.Color(color), BlendMode.SrcIn),
    );

    if (!iconSvg) {
        return null;
    }

    // Use static viewBox dimensions rather than calling iconSvg.width() /
    // iconSvg.height() on the JSI host object.  Calling those methods when
    // the underlying SkSVGDOM pointer is null/disposed causes a SIGSEGV
    // (EXC_BAD_ACCESS at 0x40) that crashes the JS thread.
    const src = rect(0, 0, viewWidth, viewHeight);
    const dst = rect(0, 0, size, size);

    return (
        <View
            style={{
                justifyContent: "flex-start",
                alignItems: "center",
                width: label ? size * 2 : size,
                height: label ? size * 2 : size,
            }}
        >
            <View style={{ width: size, height: size }}>
                <Canvas style={{ flex: 1 }}>
                    <Group
                        layer={paintColor}
                        transform={fitbox("contain", src, dst)}
                    >
                        {opacity === undefined ? (
                            <Group>
                                <ImageSVG svg={iconSvg} />
                            </Group>
                        ) : (
                            <FaderGroup opacity={opacity}>
                                <ImageSVG svg={iconSvg} />
                            </FaderGroup>
                        )}
                    </Group>
                </Canvas>
            </View>
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

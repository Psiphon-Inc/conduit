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
import React from "react";
import { View } from "react-native";
import { SharedValue } from "react-native-reanimated";

import { FaderGroup } from "@/src/components/canvas/FaderGroup";

const ICONS = {
    check: require("@/assets/images/icons/check.svg"),
    "chevron-down": require("@/assets/images/icons/chevron-down.svg"),
    copy: require("@/assets/images/icons/copy.svg"),
    edit: require("@/assets/images/icons/edit.svg"),
    send: require("@/assets/images/icons/send.svg"),
    settings: require("@/assets/images/icons/settings.svg"),
    question: require("@/assets/images/icons/question.svg"),
    "external-link": require("@/assets/images/icons/external-link.svg"),
};

type IconName =
    | "check"
    | "chevron-down"
    | "copy"
    | "edit"
    | "send"
    | "settings"
    | "question"
    | "external-link";

export function Icon({
    name,
    size,
    color,
    opacity = undefined,
}: {
    name: IconName;
    size: number;
    color: string;
    opacity?: SharedValue<number> | undefined;
}) {
    const iconSvg = useSVG(ICONS[name]);
    const paintColor = React.useMemo(() => Skia.Paint(), []);
    paintColor.setColorFilter(
        Skia.ColorFilter.MakeBlend(Skia.Color(color), BlendMode.SrcIn),
    );

    if (!iconSvg) {
        return null;
    }

    const src = rect(0, 0, iconSvg.width(), iconSvg.height());
    const dst = rect(0, 0, size, size);

    return (
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
    );
}

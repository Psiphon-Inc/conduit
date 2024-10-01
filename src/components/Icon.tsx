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

const ICONS = {
    check: require("@/assets/images/icons/check.svg"),
    "chevron-down": require("@/assets/images/icons/chevron-down.svg"),
    copy: require("@/assets/images/icons/copy.svg"),
    edit: require("@/assets/images/icons/edit.svg"),
    send: require("@/assets/images/icons/send.svg"),
};

type IconName = "check" | "chevron-down" | "copy" | "edit" | "send";

export function Icon({
    name,
    size,
    color,
}: {
    name: IconName;
    size: number;
    color: string;
}) {
    const iconSvg = useSVG(ICONS[name]);
    const paint = React.useMemo(() => Skia.Paint(), []);
    paint.setColorFilter(
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
                <Group layer={paint} transform={fitbox("contain", src, dst)}>
                    <ImageSVG svg={iconSvg} />
                </Group>
            </Canvas>
        </View>
    );
}

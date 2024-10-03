import {
    BlendMode,
    Canvas,
    ColorMatrix,
    Group,
    ImageSVG,
    Paint,
    Skia,
    fitbox,
    rect,
    useSVG,
} from "@shopify/react-native-skia";
import React from "react";
import { View } from "react-native";
import { SharedValue, useDerivedValue } from "react-native-reanimated";

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

    const opacityMatrix = useDerivedValue(() => {
        const a = opacity !== undefined ? opacity.value : 1;
        // prettier-ignore
        return [
          //R, G, B, A, Bias
            1, 0, 0, 0, 0,
            0, 1, 0, 0, 0,
            0, 0, 1, 0, 0,
            0, 0, 0, a, 0,
        ];
    });

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
                    <Group
                        layer={
                            <Paint>
                                <ColorMatrix matrix={opacityMatrix} />
                            </Paint>
                        }
                    >
                        <ImageSVG svg={iconSvg} />
                    </Group>
                </Group>
            </Canvas>
        </View>
    );
}

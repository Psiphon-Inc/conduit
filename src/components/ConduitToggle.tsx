import {
    Blur,
    Canvas,
    Circle,
    Group,
    LinearGradient,
    Paint,
    Text,
    useFont,
    vec,
} from "@shopify/react-native-skia";
import { Pressable } from "react-native";

import React from "react";
import { palette, sharedStyles as ss } from "../styles";

export function ConduitToggle({ size }: { size: number }) {
    const radius = size / 2;
    const blur = 4;
    const transform = [
        {
            translateY: radius + blur / 2,
        },
        {
            translateX: radius + blur / 2,
        },
    ];
    const [buttonText, setButtonText] = React.useState("Turn ON");

    const font = useFont(
        require("../../assets/fonts/SpaceMono-Regular.ttf"),
        20
    );
    if (!font) {
        return null;
    }
    const textX = radius - font.measureText(buttonText).width / 2
    const textY = radius + font.measureText(buttonText).height / 2

    // TODO: Placeholder
    const toggleInProxy = () => {
        console.log("toggle in proxy");
    };

    return (
        <Pressable
            style={{
                width: size + blur,
                height: size + blur,
            }}
            onPress={toggleInProxy}
        >
            <Canvas style={[ss.flex]}>
                <Group>
                    <Blur blur={4} />
                    <Group transform={transform}>
                        <Circle r={radius} color={palette.grey}>
                            <Paint
                                color={palette.grey}
                                style="stroke"
                                strokeWidth={2}
                            />
                        </Circle>
                    </Group>
                </Group>
                <Group>
                <Text
                    x={textX}
                    y={textY}
                    text={buttonText}
                    font={font}
                >
                    <LinearGradient
                        start={vec(textX,textY)}
                        end={vec(textX+20, textY+10)}
                        colors={[palette.white, palette.purple]}
                    />
                </Text>
                </Group>
            </Canvas>
        </Pressable>
    );
}

import { Text } from "react-native";
import { SharedValue, runOnJS, useDerivedValue } from "react-native-reanimated";

import React from "react";

export function AnimatedText({
    text,
    color,
    fontSize,
    fontFamily,
}: {
    text: SharedValue<string>;
    color: string;
    fontSize: number;
    fontFamily: string;
}) {
    const [renderText, setRenderText] = React.useState(text.value);
    useDerivedValue(() => runOnJS(setRenderText)(text.value));

    return (
        <Text
            style={{ color: color, fontSize: fontSize, fontFamily: fontFamily }}
        >
            {renderText}
        </Text>
    );
}

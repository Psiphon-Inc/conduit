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
import React from "react";
import { TextInput } from "react-native";
import Animated, {
    SharedValue,
    useAnimatedProps,
} from "react-native-reanimated";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

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
    const animatedProps = useAnimatedProps(() => {
        return { text: text.value, defaultValue: text.value } as any;
    });

    return (
        <AnimatedTextInput
            animatedProps={animatedProps}
            editable={false}
            style={{
                color: color,
                fontSize: fontSize,
                fontFamily: fontFamily,
                padding: 0,
                margin: 0,
            }}
        />
    );
}

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
 */
import { Canvas, LinearGradient, Rect, vec } from "@shopify/react-native-skia";
import React from "react";
import { LayoutChangeEvent, StyleSheet, View, ViewProps } from "react-native";

export function DropdownSection(props: React.PropsWithChildren<ViewProps>) {
    const { children, style, ...rest } = props;
    const [size, setSize] = React.useState({ width: 0, height: 0 });

    const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;

        setSize((current) => {
            if (current.width === width && current.height === height) {
                return current;
            }

            return { width, height };
        });
    }, []);

    return (
        <View
            {...rest}
            onLayout={handleLayout}
            style={[
                {
                    marginHorizontal: -10,
                    marginBottom: -10,
                    overflow: "hidden",
                    backgroundColor: "rgba(157, 129, 201, 0.12)",
                },
                style,
            ]}
        >
            <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
                {size.width > 0 && size.height > 0 ? (
                    <Canvas style={StyleSheet.absoluteFillObject}>
                        <Rect
                            x={0}
                            y={0}
                            width={size.width}
                            height={size.height}
                        >
                            <LinearGradient
                                start={vec(0, 0)}
                                end={vec(0, size.height)}
                                colors={[
                                    "rgba(255, 255, 255, 0.94)",
                                    "rgba(157, 129, 201, 0.52)",
                                ]}
                            />
                        </Rect>
                    </Canvas>
                ) : null}
            </View>
            <View>{children}</View>
        </View>
    );
}

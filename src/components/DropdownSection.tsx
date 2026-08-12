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
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";

export function DropdownSection(props: React.PropsWithChildren<ViewProps>) {
    const { children, style, ...rest } = props;

    return (
        <View
            {...rest}
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
            <LinearGradient
                pointerEvents="none"
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                colors={[
                    "rgba(255, 255, 255, 0.94)",
                    "rgba(157, 129, 201, 0.52)",
                ]}
            />
            <View>{children}</View>
        </View>
    );
}

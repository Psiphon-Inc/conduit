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
 *
 */
import { Canvas, LinearGradient, Rect, vec } from "@shopify/react-native-skia";
import React from "react";
import { View, useWindowDimensions } from "react-native";

import { ConduitSettings } from "@/src/components/ConduitSettings";
import { SafeAreaView } from "@/src/components/SafeAreaView";

export default function SettingsScreen() {
    const win = useWindowDimensions();

    return (
        <View style={{ flex: 1 }}>
            <Canvas
                style={{
                    position: "absolute",
                    width: win.width,
                    height: win.height,
                }}
            >
                <Rect x={0} y={0} width={win.width} height={win.height}>
                    <LinearGradient
                        start={vec(0, win.height)}
                        end={vec(0, 0)}
                        colors={["#FCDFD7", "#F0E0EB", "#E8DFF2", "#FFFFFF"]}
                        positions={[0.08, 0.19, 0.33, 0.78]}
                    />
                </Rect>
            </Canvas>
            <SafeAreaView>
                <ConduitSettings inline={true} />
            </SafeAreaView>
        </View>
    );
}

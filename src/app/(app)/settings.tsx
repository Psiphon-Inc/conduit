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
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Platform, View, useWindowDimensions } from "react-native";

import { ConduitSettings } from "@/src/components/ConduitSettings";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { APP_MAX_CONTENT_WIDTH } from "@/src/constants";

export default function SettingsScreen() {
    const win = useWindowDimensions();

    return (
        <View style={{ flex: 1 }}>
            <LinearGradient
                style={{
                    position: "absolute",
                    width: win.width,
                    height: win.height,
                }}
                start={{ x: 0, y: 1 }}
                end={{ x: 0, y: 0 }}
                colors={["#FCDFD7", "#F0E0EB", "#E8DFF2", "#FFFFFF"]}
                locations={[0.08, 0.19, 0.33, 0.78]}
            />
            {/* Web keeps the bottom inset (matching the former
                settings.web.tsx); native excludes it. */}
            <SafeAreaView includeBottomInset={Platform.OS === "web"}>
                <View
                    style={{
                        flex: 1,
                        width: "100%",
                        maxWidth: APP_MAX_CONTENT_WIDTH,
                        alignSelf: "center",
                    }}
                >
                    <ConduitSettings inline={true} />
                </View>
            </SafeAreaView>
        </View>
    );
}

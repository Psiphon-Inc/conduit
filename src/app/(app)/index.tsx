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
import { useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActionsArea } from "@/src/components/ActionsArea";
import { ConduitOrbToggle } from "@/src/components/ConduitOrbToggle";
import { ConduitStatus } from "@/src/components/ConduitStatus";
import { LogoWordmark } from "@/src/components/LogoWordmark";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { SkyBox } from "@/src/components/SkyBox";

export default function HomeScreen() {
    const win = useWindowDimensions();
    const insets = useSafeAreaInsets();

    // This layout is slightly imprecise due to a bug in Android/React Native
    // https://github.com/facebook/react-native/issues/47080
    const totalUsableHeight = win.height - (insets.top + insets.bottom);
    const totalUsableWidth = win.width;

    // NOTE this assumes a portrait layout.

    return (
        <GestureHandlerRootView>
            <SkyBox />
            <SafeAreaView>
                {/* Header takes up 10% of vertical space */}
                <LogoWordmark
                    width={totalUsableWidth}
                    height={totalUsableHeight * 0.1}
                />
                {/* Orb takes up the middle 50% of the vertical space */}
                <ConduitOrbToggle
                    width={totalUsableWidth}
                    height={totalUsableHeight * 0.5}
                />
                {/* Status taking up the next 25% of the vertical space */}
                <ConduitStatus
                    width={totalUsableWidth}
                    height={totalUsableHeight * 0.25}
                />
                {/* Actions Area taking up the last 15% of the vertical space */}
                <ActionsArea
                    width={totalUsableWidth}
                    height={totalUsableHeight * 0.2}
                />
            </SafeAreaView>
        </GestureHandlerRootView>
    );
}

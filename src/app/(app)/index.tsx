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

import { ConduitOrbToggle } from "@/src/components/ConduitOrbToggle";
import { ConduitSettings } from "@/src/components/ConduitSettings";
import { ConduitStatus } from "@/src/components/ConduitStatus";
import { GitHash } from "@/src/components/GitHash";
import { KeepAwakeOnIOS } from "@/src/components/KeepAwake";
import { LogoWordmark } from "@/src/components/LogoWordmark";
import { SafeAreaView } from "@/src/components/SafeAreaView";

export default function HomeScreen() {
    const win = useWindowDimensions();

    // NOTE this assumes a portrait layout.
    const totalUsableHeight = win.height;
    const totalUsableWidth = win.width;
    const logoWordmarkHeight = totalUsableHeight * 0.1;
    const conduitOrbToggleHeight = totalUsableHeight * 0.6;
    const conduitStatusHeight = totalUsableHeight * 0.3;
    const bottomActionsHeight = totalUsableWidth * 0.2; // Note this is a ratio of width

    return (
        <GestureHandlerRootView>
            <SafeAreaView>
                {/* Header takes up 10% of vertical space */}
                <LogoWordmark
                    width={totalUsableWidth}
                    height={logoWordmarkHeight}
                />
                {/* Orb takes up the middle 60% of the vertical space */}
                <ConduitOrbToggle
                    width={totalUsableWidth}
                    height={conduitOrbToggleHeight}
                />
                {/* Status taking up bottom 30% of the vertical space */}
                <ConduitStatus
                    width={totalUsableWidth}
                    height={conduitStatusHeight}
                />
                {/* Settings icon is absolutely positioned bottom right */}
                <ConduitSettings iconSize={bottomActionsHeight} />
                {/* GIT_HASH absolutely positioned bottom left */}
                <GitHash />
                {/* Keep the screen open on iOS */}
                <KeepAwakeOnIOS />
            </SafeAreaView>
        </GestureHandlerRootView>
    );
}

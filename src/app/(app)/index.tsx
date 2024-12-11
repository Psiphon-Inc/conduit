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

import { ConduitOrbToggle } from "@/src/components/ConduitOrbToggle";
import { ConduitSettings } from "@/src/components/ConduitSettings";
import { ConduitStatus } from "@/src/components/ConduitStatus";
import { GitHash } from "@/src/components/GitHash";
import { KeepAwakeOnIOS } from "@/src/components/KeepAwake";
import { LogoWordmark } from "@/src/components/LogoWordmark";
import { SafeAreaView } from "@/src/components/SafeAreaView";

export default function HomeScreen() {
    const win = useWindowDimensions();
    const insets = useSafeAreaInsets();

    // NOTE this assumes a portrait layout.
    const totalUsableHeight = win.height - insets.top;
    const totalUsableWidth = win.width;

    // TODO: refactor this layout, for some reason the win.height value is too
    // large, so taking the entire 100% overflows. Arbitrarily leave 3% off for
    // now, and pin ConduitStatus to the bottom with position: absolute.
    const logoWordmarkHeight = totalUsableHeight * 0.1;
    const conduitOrbToggleHeight = totalUsableHeight * 0.52;
    const conduitStatusHeight = totalUsableHeight * 0.35;

    return (
        <GestureHandlerRootView>
            <SafeAreaView>
                {/* Header takes up 10% of vertical space */}
                <LogoWordmark
                    width={totalUsableWidth}
                    height={logoWordmarkHeight}
                />
                {/* Orb takes up the middle 52% of the vertical space */}
                <ConduitOrbToggle
                    width={totalUsableWidth}
                    height={conduitOrbToggleHeight}
                />
                {/* Status taking up bottom 35% of the vertical space */}
                <ConduitStatus
                    width={totalUsableWidth}
                    height={conduitStatusHeight}
                />
                {/* Settings icon is absolutely positioned bottom right */}
                <ConduitSettings />
                {/* GIT_HASH absolutely positioned bottom left */}
                <GitHash />
                {/* Keep the screen open on iOS */}
                <KeepAwakeOnIOS />
            </SafeAreaView>
        </GestureHandlerRootView>
    );
}

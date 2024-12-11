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
import { LayoutChangeEvent, useWindowDimensions, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConduitOrbToggle } from "@/src/components/ConduitOrbToggle";
import { ConduitSettings } from "@/src/components/ConduitSettings";
import { ConduitStatus } from "@/src/components/ConduitStatus";
import { GitHash } from "@/src/components/GitHash";
import { KeepAwakeOnIOS } from "@/src/components/KeepAwake";
import { LogoWordmark } from "@/src/components/LogoWordmark";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { sharedStyles as ss } from "@/src/styles";

export default function HomeScreen() {
    const win = useWindowDimensions();
    const insets = useSafeAreaInsets();

    // Derive usable dimensions from an absolutely positioned View
    // https://github.com/facebook/react-native/issues/47080
    const [totalUsableWidth, setTotalUsableWidth] = React.useState(win.width);
    const [totalUsableHeight, setTotalUsableHeight] = React.useState(
        win.height,
    );

    function onScreenLayout(event: LayoutChangeEvent) {
        setTotalUsableWidth(event.nativeEvent.layout.width);
        setTotalUsableHeight(event.nativeEvent.layout.height - insets.top);
    }

    // NOTE this assumes a portrait layout.

    return (
        <GestureHandlerRootView>
            <View onLayout={onScreenLayout} style={[ss.absoluteFill]} />
            <SafeAreaView>
                {/* Header takes up 10% of vertical space */}
                <LogoWordmark
                    width={totalUsableWidth}
                    height={totalUsableHeight * 0.1}
                />
                {/* Orb takes up the middle 55% of the vertical space */}
                <ConduitOrbToggle
                    width={totalUsableWidth}
                    height={totalUsableHeight * 0.55}
                />
                {/* Status taking up bottom 35% of the vertical space */}
                <ConduitStatus
                    width={totalUsableWidth}
                    height={totalUsableHeight * 0.35}
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

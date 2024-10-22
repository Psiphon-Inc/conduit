import React from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConduitOrbToggle } from "@/src/components/ConduitOrbToggle";
import { ConduitSettings } from "@/src/components/ConduitSettings";
import { ConduitStatus } from "@/src/components/ConduitStatus";
import { GitHash } from "@/src/components/GitHash";
import { LogoWordmark } from "@/src/components/LogoWordmark";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function HomeScreen() {
    const win = useWindowDimensions();
    const insets = useSafeAreaInsets();

    // NOTE this assumes a portrait layout.
    const totalUsableHeight = win.height - insets.top - insets.bottom;
    const totalUsableWidth = win.width - insets.left - insets.right;
    const logoWordmarkHeight = totalUsableHeight * 0.1;
    const conduitOrbToggleHeight = totalUsableHeight - logoWordmarkHeight;
    const conduitStatusHeight =
        totalUsableHeight - totalUsableWidth - logoWordmarkHeight;

    return (
        <GestureHandlerRootView>
            <SafeAreaView>
                {/* Header takes up 10% of vertical space */}
                <LogoWordmark
                    width={totalUsableWidth}
                    height={logoWordmarkHeight}
                />
                {/* Status is an absolutely positioned background */}
                <ConduitStatus
                    width={totalUsableWidth}
                    height={conduitStatusHeight}
                />
                {/* Orb takes up the rest of the height not used by LogoWordmark */}
                <ConduitOrbToggle
                    width={totalUsableWidth}
                    height={conduitOrbToggleHeight}
                />
                {/* Settings icon is absolutely positioned bottom right */}
                <ConduitSettings />
                {/* GIT_HASH absolutely positioned bottom left */}
                <GitHash />
            </SafeAreaView>
        </GestureHandlerRootView>
    );
}

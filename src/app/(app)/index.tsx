import React from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConduitOrbToggle } from "@/src/components/ConduitOrbToggle";
import { ConduitSettings } from "@/src/components/ConduitSettings";
import { ConduitStatus } from "@/src/components/ConduitStatus";
import { GitHash } from "@/src/components/GitHash";
import { LogoWordmark } from "@/src/components/LogoWordmark";
import { SafeAreaView } from "@/src/components/SafeAreaView";

export default function HomeScreen() {
    const win = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const totalUsableHeight = win.height - insets.top - insets.bottom;
    const totalUsableWidth = win.width - insets.left - insets.right;
    const logoWordmarkHeight = totalUsableHeight * 0.1;
    // orb takes up a square with dimensions = width
    // NOTE this assumes a portrait layout.
    const conduitOrbToggleHeight = totalUsableWidth;
    const conduitStatusHeight =
        totalUsableHeight - logoWordmarkHeight - conduitOrbToggleHeight;

    return (
        <SafeAreaView>
            {/* Header takes up 10% of vertical space */}
            <LogoWordmark
                width={totalUsableWidth}
                height={logoWordmarkHeight}
            />
            {/* Orb takes up a square, full width */}
            <ConduitOrbToggle size={conduitOrbToggleHeight} />
            {/* Status takes up the rest of the vertical space */}
            <ConduitStatus
                width={totalUsableWidth}
                height={conduitStatusHeight}
            />
            {/* Settings icon is absolutely positioned bottom right */}
            <ConduitSettings />
            {/* GIT_HASH absolutely positioned bottom left */}
            <GitHash />
        </SafeAreaView>
    );
}

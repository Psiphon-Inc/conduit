import React from "react";
import { useWindowDimensions } from "react-native";

import { ConduitOrbToggle } from "@/src/components/ConduitOrbToggle";
import { ConduitSettings } from "@/src/components/ConduitSettings";
import { ConduitStatus } from "@/src/components/ConduitStatus";
import { LogoWordmark } from "@/src/components/LogoWordmark";
import { SafeAreaView } from "@/src/components/SafeAreaView";

export default function HomeScreen() {
    const win = useWindowDimensions();

    return (
        <SafeAreaView>
            {/* Header takes up 10% of vertical space */}
            <LogoWordmark width={win.width} height={win.height * 0.1} />
            {/* Orb takes up a square, full width */}
            <ConduitOrbToggle size={win.width} />
            {/* Status takes up the rest of the vertical space */}
            <ConduitStatus
                width={win.width}
                height={win.height * 0.9 - win.width}
            />
            {/* Settings icon is absolutely positioned */}
            <ConduitSettings />
        </SafeAreaView>
    );
}

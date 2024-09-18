import React from "react";
import { useWindowDimensions } from "react-native";

import { ConduitHeader } from "@/src/components/ConduitHeader";
import { ConduitOrbToggle } from "@/src/components/ConduitOrbToggle";
import { ConduitStatus } from "@/src/components/ConduitStatus";
import { SafeAreaView } from "@/src/components/SafeAreaView";

export default function HomeScreen() {
    const win = useWindowDimensions();

    return (
        <SafeAreaView>
            {/* Header takes up 10% of vertical space */}
            <ConduitHeader width={win.width} height={win.height * 0.1} />
            {/* Orb takes up a square, full width */}
            <ConduitOrbToggle size={win.width} />
            {/* Status takes up the rest of the vertical space */}
            <ConduitStatus
                width={win.width}
                height={win.height - win.width - 100}
            />
        </SafeAreaView>
    );
}

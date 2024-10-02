import { Stack } from "expo-router";
import React from "react";

import { timedLog } from "@/src/common/utils";
import { InProxyProvider } from "@/src/inproxy/context";

export default function AppLayout() {
    timedLog("AppLayout");
    return (
        <InProxyProvider>
            <Stack
                screenOptions={{
                    headerShown: false,
                    animation: "fade",
                }}
            >
                <Stack.Screen name="index" />
                <Stack.Screen name="onboarding" />
            </Stack>
        </InProxyProvider>
    );
}

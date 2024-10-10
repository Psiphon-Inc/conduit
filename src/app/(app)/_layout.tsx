import { Stack } from "expo-router";
import React from "react";

import { InProxyProvider } from "@/src/inproxy/context";

export default function AppLayout() {
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

import { Stack } from "expo-router";
import React from "react";

import { InproxyProvider } from "@/src/inproxy/context";

export default function AppLayout() {
    return (
        <InproxyProvider>
            <Stack
                screenOptions={{
                    headerShown: false,
                    animation: "fade",
                }}
            >
                <Stack.Screen name="index" />
                <Stack.Screen name="onboarding" />
            </Stack>
        </InproxyProvider>
    );
}

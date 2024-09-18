import { Redirect, Stack } from "expo-router";
import React from "react";

import { AccountProvider } from "@/src/account/context";
import { useAuthContext } from "@/src/auth/context";
import { InProxyProvider } from "@/src/psiphon/mockContext";

export default function AppLayout() {
    const { mnemonic, deviceNonce } = useAuthContext();

    if (!mnemonic || !deviceNonce) {
        // We are not authenticated
        return <Redirect href="/" />;
    }
    return (
        <InProxyProvider>
            <AccountProvider mnemonic={mnemonic} deviceNonce={deviceNonce}>
                <Stack
                    screenOptions={{
                        headerShown: false,
                    }}
                >
                    <Stack.Screen name="index" />
                </Stack>
            </AccountProvider>
        </InProxyProvider>
    );
}

import { Redirect, Stack } from "expo-router";
import React from "react";

import { AccountProvider } from "@/src/account/context";
import { useAuthContext } from "@/src/auth/context";
import {
    InProxyActivityProvider,
    InProxyProvider,
} from "@/src/psiphon/mockContext";
import { palette } from "@/src/styles";

export default function AppLayout() {
    const { mnemonic, deviceNonce } = useAuthContext();

    if (!mnemonic || !deviceNonce) {
        // We are not authenticated
        return <Redirect href="/" />;
    }
    return (
        <InProxyProvider>
            <InProxyActivityProvider>
                <AccountProvider mnemonic={mnemonic} deviceNonce={deviceNonce}>
                    <Stack
                        screenOptions={{
                            headerShown: false,
                            animation: "fade",
                            contentStyle: {
                                backgroundColor: palette.black,
                            },
                        }}
                    >
                        <Stack.Screen
                            name="index"
                            options={{
                                contentStyle: {
                                    backgroundColor: palette.black,
                                },
                            }}
                        />
                    </Stack>
                </AccountProvider>
            </InProxyActivityProvider>
        </InProxyProvider>
    );
}

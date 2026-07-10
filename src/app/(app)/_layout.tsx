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
import { Stack, usePathname } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";

import { isE2E } from "@/src/common/e2e";
import { AppBottomNav } from "@/src/components/AppBottomNav";
import { ConduitActionsProvider } from "@/src/components/ConduitActionsContext";
import { ModalHost, ModalProvider } from "@/src/components/ModalStore";
import { readHostedRuntimeConfig } from "@/src/hosted/config";
import { HostedExperienceProvider } from "@/src/hosted/experience/context";
import { useHostedExperienceIsOffline } from "@/src/hosted/experience/hooks";
import { RevenueCatProvider } from "@/src/hosted/revenuecatContext";
import { InproxyProvider, useInproxyContext } from "@/src/inproxy/context";
import { useInproxyStatus } from "@/src/inproxy/hooks";
import { palette } from "@/src/styles";

export default function AppLayout() {
    const hostedConfig = React.useMemo(readHostedRuntimeConfig, []);
    const pathname = usePathname();
    const showBottomNav =
        pathname !== "/onboarding" &&
        pathname !== "/(app)/onboarding" &&
        pathname !== "/sso-callback" &&
        pathname !== "/(app)/sso-callback";

    return (
        <ModalProvider>
            <InproxyProvider>
                <RevenueCatProvider>
                    <HostedExperienceProvider
                        baseUrl={hostedConfig.baseUrl}
                        revenueCatPublicKeys={hostedConfig.revenueCatPublicKeys}
                    >
                        <ConduitActionsProvider>
                            <ModalHost />
                            <AppShell showBottomNav={showBottomNav} />
                        </ConduitActionsProvider>
                    </HostedExperienceProvider>
                </RevenueCatProvider>
            </InproxyProvider>
        </ModalProvider>
    );
}

function AppShell({ showBottomNav }: { showBottomNav: boolean }) {
    return (
        <View
            testID="app-ready"
            accessibilityLabel="app-ready"
            style={styles.appShell}
        >
            <View style={{ flex: 1 }}>
                <Stack
                    screenOptions={{
                        headerShown: false,
                        animation: "fade",
                        contentStyle: {
                            backgroundColor: palette.white,
                        },
                    }}
                >
                    <Stack.Screen name="index" />
                    <Stack.Screen name="onboarding" />
                    <Stack.Screen name="hosted-setup" />
                    <Stack.Screen name="hosted-dashboard" />
                    <Stack.Screen name="settings" />
                    <Stack.Screen name="account" />
                    <Stack.Screen name="sso-callback" />
                </Stack>
            </View>
            {showBottomNav ? <AppBottomNav /> : null}
            {isE2E() ? (
                <>
                    <HostedApiOfflineMarker />
                    <LocalPairingReadyMarker />
                    <ConduitRunningMarker />
                </>
            ) : null}
        </View>
    );
}

function HostedApiOfflineMarker() {
    const isOffline = useHostedExperienceIsOffline();
    if (!isOffline) {
        return null;
    }

    return (
        <View
            testID="hosted-api-offline"
            accessibilityLabel="hosted-api-offline"
            style={[styles.stateMarker, styles.hostedApiOfflineMarker]}
            pointerEvents="none"
        />
    );
}

function LocalPairingReadyMarker() {
    const { isPersonalPairingReady } = useInproxyContext();
    if (!isPersonalPairingReady) {
        return null;
    }

    return (
        <View
            testID="local-pairing-ready"
            accessibilityLabel="local-pairing-ready"
            style={[styles.stateMarker, styles.localPairingReadyMarker]}
            pointerEvents="none"
        />
    );
}

function ConduitRunningMarker() {
    const { data: inproxyStatus } = useInproxyStatus();
    if (inproxyStatus !== "RUNNING") {
        return null;
    }

    return (
        <View
            testID="conduit-running"
            accessibilityLabel="conduit-running"
            style={[styles.stateMarker, styles.conduitRunningMarker]}
            pointerEvents="none"
        />
    );
}

const styles = StyleSheet.create({
    appShell: {
        flex: 1,
    },
    stateMarker: {
        position: "absolute",
        left: 0,
        width: 8,
        height: 8,
        backgroundColor: "#000",
        zIndex: 1,
    },
    hostedApiOfflineMarker: {
        top: 0,
    },
    localPairingReadyMarker: {
        top: 8,
    },
    conduitRunningMarker: {
        top: 16,
    },
});

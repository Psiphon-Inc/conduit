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
import { View } from "react-native";

import { AppBottomNav } from "@/src/components/AppBottomNav";
import { ConduitActionsProvider } from "@/src/components/ConduitActionsContext";
import { ModalHost, ModalProvider } from "@/src/components/ModalStore";
import { readHostedRuntimeConfig } from "@/src/hosted/config";
import { HostedExperienceProvider } from "@/src/hosted/experience/context";
import { RevenueCatProvider } from "@/src/hosted/revenuecatContext";
import { InproxyProvider } from "@/src/inproxy/context";
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
                            <View style={{ flex: 1 }}>
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
                                        <Stack.Screen name="sso-callback" />
                                    </Stack>
                                </View>
                                {showBottomNav ? <AppBottomNav /> : null}
                            </View>
                        </ConduitActionsProvider>
                    </HostedExperienceProvider>
                </RevenueCatProvider>
            </InproxyProvider>
        </ModalProvider>
    );
}

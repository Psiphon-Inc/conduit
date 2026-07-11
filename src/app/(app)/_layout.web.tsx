import { Stack, usePathname } from "expo-router";
import React from "react";
import { View, useWindowDimensions } from "react-native";

import { AppBottomNav } from "@/src/components/AppBottomNav";
import { ConduitActionsProvider } from "@/src/components/ConduitActionsContext";
import { ModalHost, ModalProvider } from "@/src/components/ModalStore";
import { WebAddToHomeScreenPromptController } from "@/src/components/WebAddToHomeScreenPrompt.web";
import { readHostedRuntimeConfig } from "@/src/hosted/config";
import { HostedExperienceProvider } from "@/src/hosted/experience/context";
import { RevenueCatProvider } from "@/src/hosted/revenuecatContext";
import { InproxyProvider } from "@/src/inproxy/context";
import { SoundTriggers } from "@/src/sound/SoundTriggers";
import { palette } from "@/src/styles";

export default function AppLayout() {
    const win = useWindowDimensions();
    const hostedConfig = React.useMemo(readHostedRuntimeConfig, []);
    const pathname = usePathname();
    const showBottomNav =
        pathname !== "/onboarding" &&
        pathname !== "/(app)/onboarding" &&
        pathname !== "/hosted-setup" &&
        pathname !== "/(app)/hosted-setup" &&
        pathname !== "/sso-callback" &&
        pathname !== "/(app)/sso-callback";
    const suppressAddToHomeScreenPrompt =
        pathname === "/sso-callback" || pathname === "/(app)/sso-callback";

    return (
        <ModalProvider>
            <InproxyProvider>
                <RevenueCatProvider>
                    <HostedExperienceProvider
                        baseUrl={hostedConfig.baseUrl}
                        revenueCatPublicKeys={hostedConfig.revenueCatPublicKeys}
                    >
                        <ConduitActionsProvider>
                            <SoundTriggers />
                            <ModalHost />
                            <WebAddToHomeScreenPromptController
                                disabled={suppressAddToHomeScreenPrompt}
                            />
                            <View
                                style={{
                                    flex: 1,
                                    width: "100%",
                                    height: win.height,
                                }}
                            >
                                <View style={{ flex: 1, width: "100%" }}>
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
                            </View>
                        </ConduitActionsProvider>
                    </HostedExperienceProvider>
                </RevenueCatProvider>
            </InproxyProvider>
        </ModalProvider>
    );
}

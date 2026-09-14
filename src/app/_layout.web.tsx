import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { useEffect } from "react";

import { AppAppearanceProvider } from "@/src/appearance/AppAppearance";
import { AppearanceChrome } from "@/src/appearance/AppearanceChrome";
import { PERF_ENABLED, PerfRecorderHost } from "@/src/common/perfProbe";
import { HostedAuthProvider } from "@/src/hosted/auth/provider";
import i18nService from "@/src/i18n/i18n";
import { hydrateSoundPreference } from "@/src/sound";
import { fonts } from "@/src/styles";
import { createAppQueryClient } from "@/src/telemetry/queryClient";

i18nService.initI18n();

const queryClient = createAppQueryClient();

export default function RootLayout() {
    useFonts({
        JuraRegular: fonts.JuraRegular,
        JuraBold: fonts.JuraBold,
        Rajdhani: fonts.Rajdhani,
    });

    useEffect(() => {
        void hydrateSoundPreference();
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            <AppAppearanceProvider>
                <AppearanceChrome>
                    <HostedAuthProvider>
                        {PERF_ENABLED ? <PerfRecorderHost /> : null}
                        <Stack
                            screenOptions={{
                                headerShown: false,
                                animation: "none",
                            }}
                        >
                            <Stack.Screen name="index" />
                            <Stack.Screen name="(app)" />
                        </Stack>
                    </HostedAuthProvider>
                </AppearanceChrome>
            </AppAppearanceProvider>
        </QueryClientProvider>
    );
}

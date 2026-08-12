import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";

import { PERF_ENABLED, PerfRecorderHost } from "@/src/common/perfProbe";
import { HostedAuthProvider } from "@/src/hosted/auth/provider";
import i18nService from "@/src/i18n/i18n";
import { hydrateSoundPreference } from "@/src/sound";
import { fonts, palette } from "@/src/styles";
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
        SystemUI.setBackgroundColorAsync(palette.black).then(() => {});
        void hydrateSoundPreference();
    }, []);

    return (
        <ThemeProvider value={DefaultTheme}>
            <QueryClientProvider client={queryClient}>
                <HostedAuthProvider>
                    {PERF_ENABLED ? <PerfRecorderHost /> : null}
                    <StatusBar style="dark" />
                    <Stack
                        screenOptions={{
                            headerShown: false,
                            animation: "none",
                            contentStyle: {
                                backgroundColor: palette.white,
                            },
                        }}
                    >
                        <Stack.Screen name="index" />
                        <Stack.Screen name="(app)" />
                    </Stack>
                </HostedAuthProvider>
            </QueryClientProvider>
        </ThemeProvider>
    );
}

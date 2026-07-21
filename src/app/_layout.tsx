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
import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useState } from "react";
import { LogBox } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ReduceMotion, ReducedMotionConfig } from "react-native-reanimated";

import { AuthProvider } from "@/src/auth/context";
import { isE2E } from "@/src/common/e2e";
import { HostedAuthProvider } from "@/src/hosted/auth/provider";
import i18nService from "@/src/i18n/i18n";
import { hydrateSoundPreference } from "@/src/sound";
import { fonts, palette } from "@/src/styles";
import { createAppQueryClient } from "@/src/telemetry/queryClient";

i18nService.initI18n();

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = createAppQueryClient();

if (isE2E()) {
    LogBox.ignoreAllLogs(true);
}

export default function RootLayout() {
    const [forceRootReady, setForceRootReady] = useState(false);
    const [loaded, fontError] = useFonts({
        JuraRegular: fonts.JuraRegular,
        JuraBold: fonts.JuraBold,
        Rajdhani: fonts.Rajdhani,
    });
    const rootReady = loaded || Boolean(fontError) || forceRootReady;

    useEffect(() => {
        if (rootReady) {
            void SplashScreen.hideAsync();
            return;
        }

        const fallbackTimer = setTimeout(() => {
            setForceRootReady(true);
        }, 2000);

        return () => {
            clearTimeout(fallbackTimer);
        };
    }, [rootReady]);

    useEffect(() => {
        SystemUI.setBackgroundColorAsync(palette.black).then(() => {});
        void hydrateSoundPreference();
    }, []);

    if (!rootReady) {
        return null;
    }

    return (
        <KeyboardProvider>
            {/* E2E builds disable Reanimated-driven animations. The idle
                withRepeat loops behind the Skia scenes otherwise repaint
                continuously, saturating the UI thread on emulators/test
                devices and starving Maestro's input driver. */}
            {isE2E() ? (
                <ReducedMotionConfig mode={ReduceMotion.Always} />
            ) : null}
            <ThemeProvider value={DefaultTheme}>
                <QueryClientProvider client={queryClient}>
                    <HostedAuthProvider>
                        <AuthProvider>
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
                                <Stack.Screen name="(app)" />
                            </Stack>
                        </AuthProvider>
                    </HostedAuthProvider>
                </QueryClientProvider>
            </ThemeProvider>
        </KeyboardProvider>
    );
}

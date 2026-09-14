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
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ReduceMotion, ReducedMotionConfig } from "react-native-reanimated";

import {
    AppAppearanceProvider,
    useAppAppearance,
} from "@/src/appearance/AppAppearance";
import { AppStartupGate } from "@/src/appearance/AppStartupGate";
import { AppearanceChrome } from "@/src/appearance/AppearanceChrome";
import { reportAppearanceFailure } from "@/src/appearance/appearanceErrors";
import { AuthProvider } from "@/src/auth/context";
import { isE2E } from "@/src/common/e2e";
import { PERF_ENABLED, PerfRecorderHost } from "@/src/common/perfProbe";
import { HostedAuthProvider } from "@/src/hosted/auth/provider";
import i18nService from "@/src/i18n/i18n";
import { hydrateSoundPreference } from "@/src/sound";
import { fonts } from "@/src/styles";
import { createAppQueryClient } from "@/src/telemetry/queryClient";

i18nService.initI18n();

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = createAppQueryClient();

if (isE2E()) {
    LogBox.ignoreAllLogs(true);
}

export default function RootLayout() {
    return (
        <QueryClientProvider client={queryClient}>
            <AppAppearanceProvider>
                <NativeRootContent />
            </AppAppearanceProvider>
        </QueryClientProvider>
    );
}

function hideNativeSplash(): void {
    void SplashScreen.hideAsync().catch((cause: unknown) => {
        reportAppearanceFailure("system-chrome", cause);
    });
}

function NativeRootContent() {
    const { skin } = useAppAppearance();
    const [loaded, fontError] = useFonts({
        JuraRegular: fonts.JuraRegular,
        JuraBold: fonts.JuraBold,
        Rajdhani: fonts.Rajdhani,
    });

    useEffect(() => {
        void hydrateSoundPreference();
    }, []);

    return (
        <AppStartupGate
            assetsReady={loaded || Boolean(fontError)}
            onReady={hideNativeSplash}
        >
            <KeyboardProvider>
                {/* E2E builds disable Reanimated-driven animations. The idle
                withRepeat loops behind the Skia scenes otherwise repaint
                continuously, saturating the UI thread on emulators/test
                devices and starving Maestro's input driver. */}
                {isE2E() ? (
                    <ReducedMotionConfig mode={ReduceMotion.Always} />
                ) : null}
                {PERF_ENABLED ? <PerfRecorderHost /> : null}
                <AppearanceChrome>
                    <HostedAuthProvider>
                        <AuthProvider>
                            <Stack
                                screenOptions={{
                                    headerShown: false,
                                    animation: "none",
                                    contentStyle: {
                                        backgroundColor: skin.background,
                                    },
                                }}
                            >
                                <Stack.Screen name="(app)" />
                            </Stack>
                        </AuthProvider>
                    </HostedAuthProvider>
                </AppearanceChrome>
            </KeyboardProvider>
        </AppStartupGate>
    );
}

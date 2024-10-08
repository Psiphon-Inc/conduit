import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import "react-native-reanimated";

import i18nService from "@/src/i18n/i18n";

i18nService.initI18n();

import { AuthProvider } from "@/src/auth/context";
import { timedLog } from "@/src/common/utils";
import { fonts, palette } from "@/src/styles";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
    timedLog("RootLayout");
    const [loaded] = useFonts({
        JuraRegular: fonts.JuraRegular,
        JuraBold: fonts.JuraBold,
    });

    useEffect(() => {
        if (loaded) {
            SplashScreen.hideAsync();
        }
    }, [loaded]);

    useEffect(() => {
        SystemUI.setBackgroundColorAsync(palette.black).then(() => {});
    }, []);

    // Splash screens should be showing until we're done loading
    if (!loaded) {
        return null;
    }

    // By default, react-query won't run requests when there is no network, but
    // we're not actually using any networked queries, so we want these to fire
    // always, regardless of network. The Conduit module has it's own network
    // state handling.
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                networkMode: "always",
            },
        },
    });

    return (
        <ThemeProvider value={DarkTheme}>
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <Stack
                        screenOptions={{
                            headerShown: false,
                            animation: "none",
                        }}
                    >
                        <Stack.Screen name="/index" />
                        <Stack.Screen name="(app)" />
                    </Stack>
                </AuthProvider>
            </QueryClientProvider>
        </ThemeProvider>
    );
}

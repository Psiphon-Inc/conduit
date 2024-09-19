import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import "react-native-reanimated";

import i18nService from "@/src/i18n/i18n";

i18nService.initI18n();

import { AuthProvider } from "@/src/auth/context";
import { NotificationsProvider } from "@/src/notifications/context";
import { palette } from "@/src/styles";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
    const [loaded] = useFonts({
        SpaceMono: require("@/assets/fonts/SpaceMono-Regular.ttf"),
    });

    useEffect(() => {
        if (loaded) {
            SplashScreen.hideAsync();
        }
    }, [loaded]);

    const queryClient = new QueryClient();

    return (
        <ThemeProvider value={DarkTheme}>
            {!loaded ? null : (
                <QueryClientProvider client={queryClient}>
                    <NotificationsProvider>
                        <AuthProvider>
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
                                    name="(app)"
                                    options={{
                                        contentStyle: {
                                            backgroundColor: palette.black,
                                        },
                                    }}
                                />
                            </Stack>
                        </AuthProvider>
                    </NotificationsProvider>
                </QueryClientProvider>
            )}
        </ThemeProvider>
    );
}

import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { polyfillWebCrypto } from "expo-standard-web-crypto";
import { useEffect } from "react";
import "react-native-reanimated";

polyfillWebCrypto();

import { AuthProvider } from "@/src/auth/context";
import { NotificationsProvider } from "@/src/notifications/context";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
    const [loaded] = useFonts({
        SpaceMono: require("../../assets/fonts/SpaceMono-Regular.ttf"),
    });

    useEffect(() => {
        if (loaded) {
            SplashScreen.hideAsync();
        }
    }, [loaded]);

    if (!loaded) {
        return null;
    }

    const queryClient = new QueryClient();

    return (
        <ThemeProvider value={DarkTheme}>
            <QueryClientProvider client={queryClient}>
                <NotificationsProvider>
                    <AuthProvider>
                        <Stack
                            screenOptions={{
                                headerShown: false,
                                animation: "fade",
                            }}
                        >
                            <Stack.Screen
                                name="(app)"
                                options={{ headerShown: false }}
                            />
                        </Stack>
                    </AuthProvider>
                </NotificationsProvider>
            </QueryClientProvider>
        </ThemeProvider>
    );
}

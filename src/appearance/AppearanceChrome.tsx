import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React from "react";

import { useAppAppearance } from "@/src/appearance/AppAppearance";

/** Keeps navigation and system bars in sync with the selected app appearance. */
export function AppearanceChrome({ children }: { children: React.ReactNode }) {
    const { skin } = useAppAppearance();
    React.useEffect(() => {
        // System UI paint is best effort; an unavailable OS API must not block UI.
        void SystemUI.setBackgroundColorAsync(skin.systemBackground).catch(
            () => {},
        );
    }, [skin.systemBackground]);
    const theme = React.useMemo(() => {
        const base = skin.id === "current" ? DefaultTheme : DarkTheme;
        return {
            ...base,
            colors: {
                ...base.colors,
                background: skin.background,
                card: skin.surface,
                text: skin.text,
                border: skin.border,
                primary: skin.accent,
            },
        };
    }, [skin]);
    return (
        <ThemeProvider value={theme}>
            <StatusBar style={skin.statusBar} />
            {children}
        </ThemeProvider>
    );
}

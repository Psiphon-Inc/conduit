import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React from "react";

import { useAppAppearance } from "@/src/appearance/AppAppearance";
import { reportAppearanceFailure } from "@/src/appearance/appearanceErrors";

/** Keeps navigation and system bars in sync with the selected app appearance. */
export function AppearanceChrome({ children }: { children: React.ReactNode }) {
    const { skin } = useAppAppearance();
    React.useEffect(() => {
        // System UI paint is best effort; an unavailable OS API must not block UI.
        void SystemUI.setBackgroundColorAsync(skin.systemBackground).catch(
            (cause: unknown) => {
                reportAppearanceFailure("system-chrome", cause);
            },
        );
    }, [skin.systemBackground]);
    const theme = React.useMemo(() => {
        const base = skin.navigationMode === "light" ? DefaultTheme : DarkTheme;
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

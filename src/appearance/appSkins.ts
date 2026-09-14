import { z } from "zod";

import { palette } from "@/src/styles";

/** Stable skin IDs stored independently of account or tunnel state. */
export const AppSkinIdSchema = z.enum(["current", "classic-dark"]);

/** A skin choice is independent of the orb scene's evolution level. */
export type AppSkinId = z.infer<typeof AppSkinIdSchema>;

/** Paint shared by app surfaces and the native/SVG renderer. */
export interface AppSkinTokens {
    readonly id: AppSkinId;
    readonly background: string;
    readonly surface: string;
    readonly text: string;
    readonly mutedText: string;
    readonly accent: string;
    readonly border: string;
    readonly selectedBackground: string;
    readonly action: string;
    readonly strongSurface: string;
    readonly statusBar: "light" | "dark";
    readonly systemBackground: string;
    readonly screenGradient: readonly [string, string, string, string];
    readonly skyGradients: readonly [string, string, string][];
    readonly orb: {
        readonly center: string;
        readonly blue: string;
        readonly purple: string;
        readonly deepBlue: string;
        readonly deepPurple: string;
        readonly rim: string;
        readonly light: string;
        readonly particle: string;
    };
}

/** Current paint is preserved verbatim; Classic Dark recalls the 2025 orb. */
export const APP_SKINS: Readonly<Record<AppSkinId, AppSkinTokens>> = {
    current: {
        id: "current",
        background: palette.white,
        surface: "#FFFFFF",
        text: palette.black,
        mutedText: palette.midGrey,
        accent: palette.purple,
        border: "rgba(0, 0, 0, 0.12)",
        selectedBackground: "rgba(126, 92, 184, 0.16)",
        action: palette.purple,
        strongSurface: palette.black,
        statusBar: "dark",
        systemBackground: palette.black,
        screenGradient: ["#FCDFD7", "#F0E0EB", "#E8DFF2", "#FFFFFF"],
        skyGradients: [
            [palette.mauve, palette.fadedMauve, palette.white],
            [palette.peach, palette.mauve, palette.fadedMauve],
            ["#F59F86", "#BB89AD", "#B3D4FF"],
            ["#F59F86", "#BB89AD", "#9C81C9"],
        ],
        orb: {
            center: palette.white,
            blue: palette.peachyMauve,
            purple: palette.peach,
            deepBlue: palette.deepMauve,
            deepPurple: palette.purple,
            rim: palette.fadedMauve,
            light: palette.peach,
            particle: "rgba(255,222,205,0.2)",
        },
    },
    "classic-dark": {
        id: "classic-dark",
        background: "#000000",
        surface: "#10161c",
        text: "#E0E0E0",
        mutedText: "#c4d7df",
        accent: "#9dbcca",
        border: "rgba(196,215,223,0.24)",
        selectedBackground: "#23495a",
        action: "#23495a",
        strongSurface: "#23495a",
        statusBar: "light",
        systemBackground: "#000000",
        screenGradient: ["#1b131e", "#0b181e", "#000000", "#000000"],
        skyGradients: [
            ["#09060a", "#000000", "#000000"],
            ["#1b131e", "#0b181e", "#000000"],
            ["#0b181e", "#09060a", "#000000"],
            ["#2e2132", "#0b181e", "#000000"],
        ],
        orb: {
            center: "#000000",
            blue: "#3b7a96",
            purple: "#5d4264",
            deepBlue: "#23495a",
            deepPurple: "#2e2132",
            rim: "#c4d7df",
            light: "#c4d7df",
            particle: "rgba(196,215,223,0.3)",
        },
    },
};

/** Unknown, missing and future skin IDs deliberately fall back to current paint. */
export function parseAppSkinPreference(value: unknown): AppSkinId {
    const parsed = AppSkinIdSchema.safeParse(value);
    return parsed.success ? parsed.data : "current";
}

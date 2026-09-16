import { z } from "zod";

import { palette } from "@/src/styles";

/** Stable skin IDs stored independently of account or tunnel state. */
export const AppSkinIdSchema = z.enum(["current", "classic-dark"]);

/** A skin choice is independent of the orb scene's evolution level. */
export type AppSkinId = z.infer<typeof AppSkinIdSchema>;

/** One paint endpoint of the existing seven-second sign-in hero pulse. */
export interface SkinHeroPulsePaint {
    readonly gradient: readonly [string, string];
    readonly glowColor: string;
    readonly glowAlpha: number;
    readonly innerShadow: string;
}

/** Paint shared by app surfaces and the native/SVG renderer. */
export interface AppSkinTokens {
    readonly id: AppSkinId;
    readonly labelKey: string;
    readonly navigationMode: "default" | "dark";
    readonly background: string;
    readonly surface: string;
    readonly text: string;
    readonly mutedText: string;
    readonly accent: string;
    readonly border: string;
    readonly subtleBorder: string;
    readonly dropdown: {
        readonly surface: string;
        readonly gradient: readonly [string, string];
    };
    readonly segmentedControl: {
        readonly selectedSurface: string;
        readonly idleSurface: string;
        readonly groupSurface: string;
    };
    readonly chartNoticeButton: {
        readonly surface: string;
        readonly text: string;
    };
    readonly navigationDivider: string;
    readonly switchActiveTrack: string;
    readonly selectedBackground: string;
    readonly action: string;
    readonly strongSurface: string;
    readonly statusBar: "light" | "dark";
    readonly systemBackground: string;
    readonly labBackground: string;
    readonly sharedSurface: string;
    readonly controlSurface: string;
    readonly panelSurface: string;
    readonly statusSurface: string;
    readonly metricsText: string;
    readonly aliasPlaceholder: string;
    readonly setupButtons: {
        readonly selectedPlanSurface: string;
        readonly selectedPlanShadow: string;
        readonly disabledSurface: string;
        readonly primarySurface: string;
        readonly secondarySurface: string;
        readonly gradientSurface: string;
        readonly gradient: readonly [string, string];
        readonly rewardsGradient: readonly [string, string];
    };
    readonly accountButtons: {
        readonly disabledPrimary: string;
        readonly disabledDanger: string;
        readonly disabledSecondary: string;
        readonly primary: string;
        readonly secondary: string;
        readonly dangerConfirmationSurface: string;
    };
    readonly hero: {
        readonly bandColors: readonly [string, string, ...string[]];
        readonly bandPositions: readonly [number, number, ...number[]];
        readonly pulseVariants: readonly [
            SkinHeroPulsePaint,
            SkinHeroPulsePaint,
        ];
    };
    readonly onboardingOrb: {
        readonly center: string;
        readonly outer: string;
        readonly topLeftShadow: string;
        readonly bottomRightShadow: string;
    };
    readonly miniOrb: {
        readonly cycleColors: readonly [string, string, string, string, string];
        readonly topLeftShadow: string;
        readonly idleBottomRightShadow: string;
        readonly activeBottomRightShadow: string;
        readonly rim: string;
    };
    readonly screenGradient: readonly [string, string, string, string];
    readonly skyGradients: readonly [string, string, string][];
    readonly orb: {
        /** Pastel evolution tables remain the original renderer compatibility profile. */
        readonly sceneProfile: "pastel" | "cold-rim";
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

const classicOrbColors = {
    center: "#000000",
    blue: "#3b7a96",
    purple: "#5d4264",
    deepBlue: "#23495a",
    deepPurple: "#2e2132",
    rim: "#c4d7df",
    light: "#c4d7df",
    particle: "rgba(196,215,223,0.3)",
};

/** Current paint is preserved verbatim; Classic Dark recalls the 2025 orb. */
export const APP_SKINS: {
    readonly [Id in AppSkinId]: AppSkinTokens & { readonly id: Id };
} = {
    current: {
        id: "current",
        labelKey: "SKIN_CURRENT_I18N.string",
        navigationMode: "default",
        background: palette.white,
        surface: "#FFFFFF",
        text: palette.black,
        mutedText: palette.midGrey,
        accent: palette.purple,
        border: "rgba(0, 0, 0, 0.12)",
        subtleBorder: palette.thinPurple,
        dropdown: {
            surface: "rgba(157, 129, 201, 0.12)",
            gradient: [
                "rgba(255, 255, 255, 0.94)",
                "rgba(157, 129, 201, 0.52)",
            ],
        },
        segmentedControl: {
            selectedSurface: palette.selectedPurple,
            idleSurface: "rgba(25, 18, 36, 0.08)",
            groupSurface: "rgba(25, 18, 36, 0.06)",
        },
        chartNoticeButton: {
            surface: "rgba(255, 255, 255, 0.78)",
            text: palette.midGrey,
        },
        navigationDivider: palette.thinPurple,
        switchActiveTrack: palette.purple,
        selectedBackground: "rgba(126, 92, 184, 0.16)",
        action: palette.purple,
        strongSurface: palette.black,
        statusBar: "dark",
        systemBackground: palette.black,
        labBackground: palette.black,
        sharedSurface: palette.white,
        controlSurface: "rgba(255, 255, 255, 0.35)",
        panelSurface: "rgba(255, 255, 255, 0.42)",
        statusSurface: palette.whiteHighlight,
        metricsText: "rgba(35, 30, 40, 0.78)",
        aliasPlaceholder: palette.peachyMauve,
        setupButtons: {
            selectedPlanSurface: "#7E5CB8",
            selectedPlanShadow: "#7E5CB8",
            disabledSurface: palette.fadedMauve,
            primarySurface: palette.purpleTint3,
            secondarySurface: palette.white,
            gradientSurface: palette.transparent,
            gradient: ["#7E5CB8", "rgba(156, 129, 201, 0.69)"],
            rewardsGradient: ["#A475E3", "rgba(156, 129, 201, 0.69)"],
        },
        accountButtons: {
            disabledPrimary: palette.fadedMauve,
            disabledDanger: palette.redTint5,
            disabledSecondary: palette.fadedMauve,
            primary: palette.purple,
            secondary: palette.white,
            dangerConfirmationSurface: palette.redTint5,
        },
        hero: {
            bandColors: [
                "rgba(219,211,236,0)",
                "rgba(187,174,227,0.18)",
                "rgba(161,143,212,0.42)",
                "rgba(136, 99, 189, 1)",
                "rgba(136, 99, 189, 1)",
                "rgba(161,143,212,0.42)",
                "rgba(187,174,227,0.18)",
                "rgba(219,211,236,0)",
            ],
            bandPositions: [0, 0.16, 0.25, 0.4, 0.6, 0.75, 0.84, 1],
            pulseVariants: [
                {
                    gradient: ["#8E77C3", "#EFA48D"],
                    glowColor: "#FFFFFF",
                    glowAlpha: 0.5,
                    innerShadow: "rgba(246,198,185,0.72)",
                },
                {
                    gradient: ["#9C85CD", "#F2B09A"],
                    glowColor: "#FFFFFF",
                    glowAlpha: 0.68,
                    innerShadow: "rgba(234,182,168,0.88)",
                },
            ],
        },
        onboardingOrb: {
            center: palette.fadedMauve,
            outer: palette.purple,
            topLeftShadow: palette.mauve,
            bottomRightShadow: palette.peach,
        },
        miniOrb: {
            cycleColors: [
                palette.deepMauve,
                palette.peach,
                palette.fadedMauve,
                palette.mauve,
                palette.fadedMauve,
            ],
            topLeftShadow: palette.mauve,
            idleBottomRightShadow: palette.peachyMauve,
            activeBottomRightShadow: palette.peach,
            rim: palette.deepMauve,
        },
        screenGradient: ["#FCDFD7", "#F0E0EB", "#E8DFF2", "#FFFFFF"],
        skyGradients: [
            [palette.mauve, palette.fadedMauve, palette.white],
            [palette.peach, palette.mauve, palette.fadedMauve],
            ["#F59F86", "#BB89AD", "#B3D4FF"],
            ["#F59F86", "#BB89AD", "#9C81C9"],
        ],
        orb: {
            sceneProfile: "pastel",
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
        labelKey: "SKIN_CLASSIC_DARK_I18N.string",
        navigationMode: "dark",
        background: "#000000",
        surface: "#10161c",
        text: "#E0E0E0",
        mutedText: "#c4d7df",
        accent: "#9dbcca",
        border: "rgba(196,215,223,0.24)",
        subtleBorder: "rgba(196,215,223,0.24)",
        dropdown: {
            surface: "#10161c",
            gradient: ["#10161c", classicOrbColors.deepBlue],
        },
        segmentedControl: {
            selectedSurface: classicOrbColors.deepBlue,
            idleSurface: "#10161c",
            groupSurface: "#10161c",
        },
        chartNoticeButton: {
            surface: classicOrbColors.deepBlue,
            text: classicOrbColors.rim,
        },
        navigationDivider: "rgba(196,215,223,0.24)",
        switchActiveTrack: "#9dbcca",
        selectedBackground: "#23495a",
        action: "#23495a",
        strongSurface: "#23495a",
        statusBar: "light",
        systemBackground: "#000000",
        labBackground: classicOrbColors.center,
        sharedSurface: "#10161c",
        controlSurface: "#10161c",
        panelSurface: "#10161c",
        statusSurface: "#10161c",
        metricsText: classicOrbColors.rim,
        aliasPlaceholder: "#A0A0A0",
        setupButtons: {
            selectedPlanSurface: classicOrbColors.deepBlue,
            selectedPlanShadow: classicOrbColors.deepBlue,
            disabledSurface: "#10161c",
            primarySurface: "#10161c",
            secondarySurface: "#10161c",
            gradientSurface: "#10161c",
            gradient: [classicOrbColors.deepBlue, classicOrbColors.deepPurple],
            rewardsGradient: [
                classicOrbColors.deepBlue,
                classicOrbColors.deepPurple,
            ],
        },
        accountButtons: {
            disabledPrimary: classicOrbColors.deepBlue,
            disabledDanger: "#10161c",
            disabledSecondary: "#10161c",
            primary: classicOrbColors.deepBlue,
            secondary: "#10161c",
            dangerConfirmationSurface: "#261719",
        },
        hero: {
            bandColors: [
                "#00000000",
                classicOrbColors.deepPurple,
                classicOrbColors.deepBlue,
                "#00000000",
            ],
            bandPositions: [0, 0.4, 0.6, 1],
            pulseVariants: [
                {
                    gradient: [
                        classicOrbColors.center,
                        classicOrbColors.deepBlue,
                    ],
                    glowColor: classicOrbColors.blue,
                    glowAlpha: 0.5 * 0.65,
                    innerShadow: classicOrbColors.purple,
                },
                {
                    gradient: [
                        classicOrbColors.center,
                        classicOrbColors.deepBlue,
                    ],
                    glowColor: classicOrbColors.blue,
                    glowAlpha: 0.68 * 0.65,
                    innerShadow: classicOrbColors.purple,
                },
            ],
        },
        onboardingOrb: {
            center: classicOrbColors.center,
            outer: classicOrbColors.deepBlue,
            topLeftShadow: classicOrbColors.blue,
            bottomRightShadow: classicOrbColors.purple,
        },
        miniOrb: {
            cycleColors: [
                classicOrbColors.center,
                classicOrbColors.deepBlue,
                classicOrbColors.deepPurple,
                classicOrbColors.blue,
                classicOrbColors.deepPurple,
            ],
            topLeftShadow: classicOrbColors.blue,
            idleBottomRightShadow: classicOrbColors.purple,
            activeBottomRightShadow: classicOrbColors.purple,
            rim: classicOrbColors.rim,
        },
        screenGradient: ["#1b131e", "#0b181e", "#000000", "#000000"],
        skyGradients: [
            ["#09060a", "#000000", "#000000"],
            ["#1b131e", "#0b181e", "#000000"],
            ["#0b181e", "#09060a", "#000000"],
            ["#2e2132", "#0b181e", "#000000"],
        ],
        orb: {
            sceneProfile: "cold-rim",
            ...classicOrbColors,
        },
    },
};

/** Unknown, missing and future skin IDs deliberately fall back to current paint. */
export function parseAppSkinPreference(value: unknown): AppSkinId {
    const parsed = AppSkinIdSchema.safeParse(value);
    return parsed.success ? parsed.data : "current";
}

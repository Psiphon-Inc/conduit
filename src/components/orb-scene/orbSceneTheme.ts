/*
 * Copyright (c) 2026, Psiphon Inc.
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
import { APP_SKINS, type AppSkinId } from "@/src/appearance/appSkins";
import { rgbaFromRgb } from "@/src/common/colorUtils";
import { palette } from "@/src/styles";

// Shared visual contract for the orb scene: theme tables, slot layouts, and
// provisioning-marker paint. Extracted from OrbScene so the Skia and native
// renderers derive their paint from one source of truth.

export type OrbEvolutionLevel = 0 | 1 | 2 | 3;

export interface OrbDefinition {
    cxRatio: number;
    cyRatio: number;
    radiusRatio: number;
}

export interface OrbTone {
    rgb: string;
    alpha: number;
}

export interface OrbTheme {
    radialInner: OrbTone;
    radialOuter: OrbTone;
    innerShadowBR: OrbTone;
    outerGlow: OrbTone;
    /** Optional cold top-left inner shadow and rim, used by Classic Dark. */
    innerShadowTL?: OrbTone;
    rimColor?: string;
}

export interface OrbSceneTheme {
    orb: OrbTheme;
    titleColor: string;
    statusLeadColor: string;

    metricColor: string;
    hintColor: string;
}

export const THEME_LEVELS: OrbEvolutionLevel[] = [0, 1, 2, 3];
export const HOSTED_ORB_THEME_LEVEL: OrbEvolutionLevel = 3;
export const DEFAULT_ORB_SLOT_MAP = [0, 1, 2];

export const ORB_LAYOUTS: Record<OrbEvolutionLevel, OrbDefinition[]> = {
    0: [{ cxRatio: 0.5, cyRatio: 0.45, radiusRatio: 0.26 }],
    1: [{ cxRatio: 0.5, cyRatio: 0.45, radiusRatio: 0.26 }],
    2: [
        { cxRatio: 0.2, cyRatio: 0.33, radiusRatio: 0.1 },
        { cxRatio: 0.5, cyRatio: 0.44, radiusRatio: 0.22 },
        { cxRatio: 0.79, cyRatio: 0.24, radiusRatio: 0.075 },
    ],
    3: [
        { cxRatio: 0.2, cyRatio: 0.33, radiusRatio: 0.1 },
        { cxRatio: 0.5, cyRatio: 0.44, radiusRatio: 0.22 },
        { cxRatio: 0.79, cyRatio: 0.24, radiusRatio: 0.075 },
    ],
};

export const SCENE_THEMES: Record<OrbEvolutionLevel, OrbSceneTheme> = {
    0: {
        // local off, no sub
        orb: {
            radialInner: {
                rgb: "rgb(169,140,206)",
                alpha: 0.3,
            },
            radialOuter: {
                rgb: "rgb(194,170,224)",
                alpha: 0.54,
            },
            innerShadowBR: {
                rgb: "rgb(246,192,179)",
                alpha: 1,
            },
            outerGlow: {
                rgb: "rgb(205,185,228)",
                alpha: 0.34,
            },
        },
        titleColor: palette.white,
        statusLeadColor: palette.white,

        metricColor: "rgba(255,255,255,0.88)",
        hintColor: "rgba(255,255,255,0.9)",
    },
    1: {
        // local on, no sub
        orb: {
            radialInner: {
                rgb: "rgb(203,156,195)",
                alpha: 0.4,
            },
            radialOuter: {
                rgb: "rgb(230, 154, 140)",
                alpha: 0.46,
            },
            innerShadowBR: {
                rgb: "rgb(246,192,179)",
                alpha: 1,
            },
            outerGlow: {
                rgb: "rgb(255,255,255)",
                alpha: 0.34,
            },
        },
        titleColor: palette.white,
        statusLeadColor: palette.black,
        metricColor: "rgba(41,30,42,0.92)",
        hintColor: palette.black,
    },
    2: {
        // local off, yes sub
        orb: {
            radialInner: {
                rgb: "rgb(155,127,200)",
                alpha: 0.3,
            },
            radialOuter: {
                rgb: "rgb(87, 63, 126)",
                alpha: 0.56,
            },
            innerShadowBR: {
                rgb: "rgb(181,146,215)",
                alpha: 1,
            },
            outerGlow: {
                rgb: "rgb(245,186,164)",
                alpha: 0.34,
            },
        },
        titleColor: palette.white,
        statusLeadColor: palette.black,
        metricColor: "rgba(38,30,45,0.92)",
        hintColor: palette.black,
    },
    3: {
        // local on, yes sub
        orb: {
            radialInner: {
                rgb: "rgb(203,156,195)",
                alpha: 0.3,
            },
            radialOuter: {
                rgb: "rgb(230, 154, 140)",
                alpha: 0.54,
            },
            innerShadowBR: {
                rgb: "rgb(246,192,179)",
                alpha: 1,
            },
            outerGlow: {
                rgb: "rgb(255,255,255)",
                alpha: 0.54,
            },
        },
        titleColor: palette.white,
        statusLeadColor: "rgba(195,228,255,0.94)",
        metricColor: "rgba(252,252,255,0.92)",
        hintColor: "rgba(243,249,255,0.92)",
    },
};

export const PROVISIONING_MARKER_ORBIT_DURATION_MS = 5600;
export const PROVISIONING_MARKER_GLOW_COLORS = [
    rgbaFromRgb(
        SCENE_THEMES[HOSTED_ORB_THEME_LEVEL].orb.innerShadowBR.rgb,
        0.72,
    ),
    rgbaFromRgb(SCENE_THEMES[HOSTED_ORB_THEME_LEVEL].orb.radialInner.rgb, 0.42),
    rgbaFromRgb(SCENE_THEMES[HOSTED_ORB_THEME_LEVEL].orb.radialOuter.rgb, 0),
];
export const PROVISIONING_MARKER_GLOW_POSITIONS = [0, 0.34, 1];

// Orb body profiles consume rgb() channels; skin tokens remain ordinary hex paint.
function skinHexToRgb(hex: string): string {
    return `rgb(${Number.parseInt(hex.slice(1, 3), 16)},${Number.parseInt(hex.slice(3, 5), 16)},${Number.parseInt(hex.slice(5, 7), 16)})`;
}

const classicSkin = APP_SKINS["classic-dark"];
const classicOrb = classicSkin.orb;
function makeClassicSceneTheme(level: OrbEvolutionLevel): OrbSceneTheme {
    return {
        orb: {
            radialInner: { rgb: skinHexToRgb(classicOrb.center), alpha: 1 },
            radialOuter: {
                rgb: skinHexToRgb(
                    level === 0 || level === 2
                        ? classicOrb.deepBlue
                        : classicOrb.deepPurple,
                ),
                alpha: 1,
            },
            innerShadowBR: { rgb: skinHexToRgb(classicOrb.purple), alpha: 1 },
            innerShadowTL: { rgb: skinHexToRgb(classicOrb.blue), alpha: 1 },
            outerGlow: {
                rgb: skinHexToRgb(
                    level === 0 || level === 2
                        ? classicOrb.blue
                        : classicOrb.purple,
                ),
                alpha: 0.54,
            },
            rimColor: classicOrb.rim,
        },
        titleColor: classicSkin.text,
        statusLeadColor: classicSkin.text,
        metricColor: classicSkin.mutedText,
        hintColor: classicSkin.text,
    };
}

const CLASSIC_SCENE_THEMES: Record<OrbEvolutionLevel, OrbSceneTheme> = {
    0: makeClassicSceneTheme(0),
    1: makeClassicSceneTheme(1),
    2: makeClassicSceneTheme(2),
    3: makeClassicSceneTheme(3),
};

/** Select renderer paint without changing evolution state, geometry or animations. */
export function getOrbSceneTheme(
    skinId: AppSkinId,
    level: OrbEvolutionLevel,
): OrbSceneTheme {
    return skinId === "current"
        ? SCENE_THEMES[level]
        : CLASSIC_SCENE_THEMES[level];
}

/** Provisioning markers use the same skin as hosted orbs, including during swaps. */
export function getProvisioningGlowColors(skinId: AppSkinId): string[] {
    if (skinId === "current") return PROVISIONING_MARKER_GLOW_COLORS;
    return [
        rgbaFromRgb(skinHexToRgb(classicOrb.rim), 0.72),
        rgbaFromRgb(skinHexToRgb(classicOrb.blue), 0.42),
        rgbaFromRgb(skinHexToRgb(classicOrb.purple), 0),
    ];
}

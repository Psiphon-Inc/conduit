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
import {
    APP_SKINS,
    type AppSkinId,
    type AppSkinTokens,
} from "@/src/appearance/appSkins";
import { rgbFromHexColor, rgbaFromRgb } from "@/src/common/colorUtils";
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

function makeColdSceneTheme(
    skin: AppSkinTokens,
    level: OrbEvolutionLevel,
): OrbSceneTheme {
    const orb = skin.orb;
    return {
        orb: {
            radialInner: { rgb: rgbFromHexColor(orb.center), alpha: 1 },
            radialOuter: {
                rgb: rgbFromHexColor(
                    level === 0 || level === 2 ? orb.deepBlue : orb.deepPurple,
                ),
                alpha: 1,
            },
            innerShadowBR: { rgb: rgbFromHexColor(orb.purple), alpha: 1 },
            innerShadowTL: { rgb: rgbFromHexColor(orb.blue), alpha: 1 },
            outerGlow: {
                rgb: rgbFromHexColor(
                    level === 0 || level === 2 ? orb.blue : orb.purple,
                ),
                alpha: 0.54,
            },
            rimColor: orb.rim,
        },
        titleColor: skin.text,
        statusLeadColor: skin.text,
        metricColor: skin.mutedText,
        hintColor: skin.text,
    };
}

// Paint is computed once, not in the animation/render loop. The pastel profile
// preserves the original translucent evolution tables; cold-rim adds opaque
// centers, the second inner shadow and the rim. This is a renderer distinction,
// not a skin-ID switch: another cold-rim skin only needs token definitions.
const sceneThemesBySkin: ReadonlyMap<
    AppSkinId,
    Record<OrbEvolutionLevel, OrbSceneTheme>
> = new Map(
    Object.values(APP_SKINS).map((skin) => [
        skin.id,
        skin.orb.sceneProfile === "pastel"
            ? SCENE_THEMES
            : {
                  0: makeColdSceneTheme(skin, 0),
                  1: makeColdSceneTheme(skin, 1),
                  2: makeColdSceneTheme(skin, 2),
                  3: makeColdSceneTheme(skin, 3),
              },
    ]),
);

/** Select renderer paint without changing evolution state, geometry or animations. */
export function getOrbSceneTheme(
    skinId: AppSkinId,
    level: OrbEvolutionLevel,
): OrbSceneTheme {
    const themes = sceneThemesBySkin.get(skinId);
    if (!themes)
        throw new Error("Orb scene skin profile missing from skin registry");
    return themes[level];
}

/** Provisioning markers use the same skin as hosted orbs, including during swaps. */
export function getProvisioningGlowColors(skinId: AppSkinId): string[] {
    const orb = APP_SKINS[skinId].orb;
    if (orb.sceneProfile === "pastel") return PROVISIONING_MARKER_GLOW_COLORS;
    return [
        rgbaFromRgb(rgbFromHexColor(orb.rim), 0.72),
        rgbaFromRgb(rgbFromHexColor(orb.blue), 0.42),
        rgbaFromRgb(rgbFromHexColor(orb.purple), 0),
    ];
}

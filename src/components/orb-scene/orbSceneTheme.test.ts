import { APP_SKINS, parseAppSkinPreference } from "@/src/appearance/appSkins";
import {
    SCENE_THEMES,
    THEME_LEVELS,
    getOrbSceneTheme,
    getProvisioningGlowColors,
} from "@/src/components/orb-scene/orbSceneTheme";

test("default and invalid preference retain every existing renderer theme exactly", () => {
    for (const level of THEME_LEVELS) {
        expect(getOrbSceneTheme(parseAppSkinPreference(null), level)).toBe(
            SCENE_THEMES[level],
        );
        expect(
            getOrbSceneTheme(
                parseAppSkinPreference({ skin: "classic-dark" }),
                level,
            ),
        ).toBe(SCENE_THEMES[level]);
    }
});

test("Classic Dark keeps readable labels and cold paint through all evolution states", () => {
    for (const level of THEME_LEVELS) {
        const theme = getOrbSceneTheme("classic-dark", level);
        expect(theme.orb.radialInner).toEqual({ rgb: "rgb(0,0,0)", alpha: 1 });
        expect(theme.orb.innerShadowTL?.rgb).toBe("rgb(59,122,150)");
        expect(theme.orb.innerShadowBR.rgb).toBe("rgb(93,66,100)");
        expect(theme.orb.rimColor).toBe(APP_SKINS["classic-dark"].orb.rim);
        expect(theme.hintColor).toBe("#E0E0E0");
        expect(theme.metricColor).toBe("#c4d7df");
        expect(SCENE_THEMES[level].orb.innerShadowTL).toBeUndefined();
    }
    expect(getOrbSceneTheme("classic-dark", 0).orb.radialOuter).not.toEqual(
        getOrbSceneTheme("classic-dark", 1).orb.radialOuter,
    );
    expect(getProvisioningGlowColors("classic-dark")).toEqual([
        "rgba(196,215,223,0.72)",
        "rgba(59,122,150,0.42)",
        "rgba(93,66,100,0)",
    ]);
});

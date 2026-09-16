import { APP_SKINS } from "@/src/appearance/appSkins";
import { hexToRgbChannels } from "@/src/common/colorUtils";
import { palette } from "@/src/styles";

function luminance(hex: string): number {
    const { r, g, b } = hexToRgbChannels(hex);
    const linear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

test("Classic placeholder is muted but readable, and active switch track is distinct from its surface", () => {
    const skin = APP_SKINS["classic-dark"];
    const background = luminance(skin.background);
    expect(luminance(skin.aliasPlaceholder)).toBeLessThan(luminance(skin.text));
    expect(
        (luminance(skin.aliasPlaceholder) + 0.05) / (background + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
        (luminance(skin.switchActiveTrack) + 0.05) / (background + 0.05),
    ).toBeGreaterThanOrEqual(3);
    expect(skin.switchActiveTrack).not.toBe(skin.action);
    expect(skin.navigationDivider).toBe(skin.border);
});

test("Current keeps original native control and navigation paint roles", () => {
    const skin = APP_SKINS.current;
    expect(skin.switchActiveTrack).toBe(palette.purple);
    expect(skin.navigationDivider).toBe(palette.thinPurple);
    expect(skin.aliasPlaceholder).toBe(palette.peachyMauve);
    expect(skin.navigationMode).toBe("default");
    expect(skin.background).toBe(palette.white);
});

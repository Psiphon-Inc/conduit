import { hexToRgbChannels, rgbFromHexColor } from "@/src/common/colorUtils";

test.each([
    ["#000000", { r: 0, g: 0, b: 0 }, "rgb(0,0,0)"],
    ["#3b7a96", { r: 59, g: 122, b: 150 }, "rgb(59,122,150)"],
    ["C4D7DF", { r: 196, g: 215, b: 223 }, "rgb(196,215,223)"],
    ["#FFFFFF", { r: 255, g: 255, b: 255 }, "rgb(255,255,255)"],
])(
    "shared palette conversion preserves channels for %s",
    (hex, channels, rgb) => {
        expect(hexToRgbChannels(hex)).toEqual(channels);
        expect(rgbFromHexColor(hex)).toBe(rgb);
    },
);

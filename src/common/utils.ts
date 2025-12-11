/*
 * Copyright (c) 2024, Psiphon Inc.
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
import { ScaledSize } from "react-native";

import { wrapError } from "@/src/common/errors";

export function byteArraysAreEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (!a || !b || a.length !== b.length) {
        return false;
    }

    return a.every((val, i) => val === b[i]);
}

export function jsonObjectToUint8Array(obj: any): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(obj));
}

export function uint8ArrayToJsonObject(arr: Uint8Array): any {
    return JSON.parse(new TextDecoder().decode(arr));
}

export function niceBytes(
    bytes: number,
    errorHandler: (error: Error) => void,
): string {
    let units = ["bytes", "KB", "MB", "GB", "TB", "PB", "EB"];
    let unit = units.shift() as string;
    try {
        while (units.length > 0 && bytes >= 1000) {
            bytes /= 1000;
            unit = units.shift() as string;
        }
    } catch (error) {
        errorHandler(wrapError(error, "Error converting number to niceBytes"));
    }

    return `${bytes.toFixed(bytes > 0 ? 1 : 0)} ${unit}`;
}

export function bytesToMB(bytes: number): number {
    "worklet";
    return bytes / 1000 / 1000;
}

export function MBToBytes(MB: number): number {
    "worklet";
    return MB * 1000 * 1000;
}

let lastLogTime = new Date();
export function timedLog(message: string) {
    const now = new Date();
    const diff = now.getTime() - lastLogTime.getTime();
    lastLogTime = new Date();
    console.log(`${now.toISOString()} (+${diff}): ${message}`);
}

export function drawBigFont(win: ScaledSize): boolean {
    // used to determine if we should scale font size down for smaller screens
    // only currently applied to skia-rendered paragraphs
    if (win.height * win.scale > 1400) {
        return true;
    } else {
        return false;
    }
}

// hexToHueDegrees extracts Hue in degrees from a hex string
// https://en.wikipedia.org/wiki/Hue
export function hexToHueDegrees(hex: string): number {
    if (hex.length != 7 || !hex.startsWith("#")) {
        console.error("Could not convert hex to hsl, invalid hex format");
        return 0;
    }

    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 8), 16);
    ((r /= 255), (g /= 255), (b /= 255));
    let max = Math.max(r, g, b);
    let min = Math.min(r, g, b);

    // "Defining hue in terms of RGB" from wikipedia
    let h = 0;
    if (max === min) {
        // leave as zero
    } else {
        let d = max - min;
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }

        h /= 6;
    }

    return Math.round(360 * h);
}

export function hueFunction(hueConfig: number[], originalHue: number) {
    let hue;

    // Check if 'hues' is an array-like object. This way we also ensure that
    // the array is not empty, which would mean no hue restriction.
    if (hueConfig && hueConfig.length > 0) {
        // originalHue is in the range [0, 1]
        // Multiply with 0.999 to change the range to [0, 1) and then truncate the index.
        hue = hueConfig[0 | (0.999 * originalHue * hueConfig.length)];
    }

    return typeof hue == "number"
        ? // A hue was specified. We need to convert the hue from
          // degrees on any turn - e.g. 746° is a perfectly valid hue -
          // to turns in the range [0, 1).
          (((hue / 360) % 1) + 1) % 1
        : // No hue configured => use original hue
          originalHue;
}

export function decToHex(v: number): string {
    v |= 0; // Ensure integer value
    return v < 0
        ? "00"
        : v < 16
          ? "0" + v.toString(16)
          : v < 256
            ? v.toString(16)
            : "ff";
}

export function hueToRgb(m1: number, m2: number, h: number): string {
    h = h < 0 ? h + 6 : h > 6 ? h - 6 : h;
    return decToHex(
        255 *
            (h < 1
                ? m1 + (m2 - m1) * h
                : h < 3
                  ? m2
                  : h < 4
                    ? m1 + (m2 - m1) * (4 - h)
                    : m1),
    );
}

export function hsl(
    hue: number,
    saturation: number,
    lightness: number,
): string {
    let result;

    if (saturation == 0) {
        const partialHex = decToHex(lightness * 255);
        result = partialHex + partialHex + partialHex;
    } else {
        const m2 =
                lightness <= 0.5
                    ? lightness * (saturation + 1)
                    : lightness + saturation - lightness * saturation,
            m1 = lightness * 2 - m2;
        result =
            hueToRgb(m1, m2, hue * 6 + 2) +
            hueToRgb(m1, m2, hue * 6) +
            hueToRgb(m1, m2, hue * 6 - 2);
    }

    return "#" + result;
}

export function correctedHsl(
    hue: number,
    saturation: number,
    lightness: number,
): string {
    // The corrector specifies the perceived middle lightness for each hue
    const correctors = [0.55, 0.5, 0.5, 0.46, 0.6, 0.55, 0.55],
        corrector = correctors[(hue * 6 + 0.5) | 0];

    // Adjust the input lightness relative to the corrector
    lightness =
        lightness < 0.5
            ? lightness * corrector * 2
            : corrector + (lightness - 0.5) * (1 - corrector) * 2;

    return hsl(hue, saturation, lightness);
}

export function lightness(defaultRange: number[]) {
    return function (value: number) {
        value = defaultRange[0] + value * (defaultRange[1] - defaultRange[0]);
        return value < 0 ? 0 : value > 1 ? 1 : value;
    };
}

export function parseHex(
    hash: string,
    startPosition: number,
    octets: number = 1,
): number {
    return parseInt(hash.substring(startPosition, startPosition + octets), 16);
}

export function uint8ArrayToHex(data: Uint8Array): string {
    let hex = "";
    for (let i = 0, l = data.length; i < l; i++) {
        hex += data[i].toString(16).padStart(2, "0");
    }
    return hex;
}

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

export function niceBytes(bytes: number, errorHandler: (error: Error) => void) {
    var units = ["bytes", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];
    var unit = units.shift() as string;
    try {
        while (units.length > 0 && bytes >= 1024) {
            bytes /= 1024;
            unit = units.shift() as string;
        }
    } catch (error) {
        errorHandler(wrapError(error, "Error converting number to niceBytes"));
    }

    return `${bytes.toFixed(bytes > 0 ? 1 : 0)} ${unit}`;
}

export function bytesToMB(bytes: number) {
    "worklet";
    return bytes / 1024 / 1024;
}

export function MBToBytes(MB: number) {
    "worklet";
    return MB * 1024 * 1024;
}

let lastLogTime = new Date();
export function timedLog(message: string) {
    const now = new Date();
    const diff = now.getTime() - lastLogTime.getTime();
    lastLogTime = new Date();
    console.log(`${now.toISOString()} (+${diff}): ${message}`);
}

export function drawBigFont(win: ScaledSize) {
    // used to determine if we should scale font size down for smaller screens
    // only currently applied to skia-rendered paragraphs
    console.log(win.height * win.scale);
    if (win.height * win.scale > 1000) {
        return true;
    } else {
        return false;
    }
}

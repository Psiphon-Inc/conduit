import { handleError, wrapError } from "@/src/common/errors";

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

export function niceBytes(bytes: number) {
    var units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];
    var unit = units.shift() as string;
    try {
        while (units.length > 0 && bytes >= 1024) {
            bytes /= 1024;
            unit = units.shift() as string;
        }
    } catch (error) {
        handleError(wrapError(error, "Error converting number to niceBytes"));
    }

    return `${bytes.toFixed(1)} ${unit}`;
}

export function bytesToMB(bytes: number) {
    return bytes / 1024 / 1024;
}

export function MBToBytes(MB: number) {
    return MB * 1024 * 1024;
}

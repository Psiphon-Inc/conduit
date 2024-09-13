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

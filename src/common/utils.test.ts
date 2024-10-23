import * as utils from "@/src/common/utils";

describe("utils", () => {
    it("byteArraysAreEqual", () => {
        const byteArrayA = new Uint8Array([1, 2, 3, 4]);
        const byteArrayLikeA = new Uint8Array([1, 2, 3, 4]);
        const byteArrayB = new Uint8Array([5, 6, 7, 8]);
        const byteArrayC = new Uint8Array([1, 2, 3, 4, 5]);

        expect(utils.byteArraysAreEqual(byteArrayA, byteArrayLikeA)).toBe(true);
        expect(utils.byteArraysAreEqual(byteArrayA, byteArrayB)).toBe(false);
        expect(utils.byteArraysAreEqual(byteArrayA, byteArrayC)).toBe(false);
    });

    it("hexToHueDegrees", () => {
        expect(utils.hexToHueDegrees("#E0E0E0")).toEqual(0);
        expect(utils.hexToHueDegrees("#000000")).toEqual(0);
        expect(utils.hexToHueDegrees("#d54028")).toEqual(8);
        expect(utils.hexToHueDegrees("#3b7a96")).toEqual(198);
        expect(utils.hexToHueDegrees("#5d4264")).toEqual(288);
    });
});

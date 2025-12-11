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

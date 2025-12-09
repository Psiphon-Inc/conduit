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
import * as validators from "@/src/common/validators";

describe("validators", () => {
    it("Uint8Array32", () => {
        const valid = new Uint8Array(32);
        const invalid1 = new Uint8Array(31);
        const invalid2 = new Uint8Array(0);
        expect(validators.Uint8Array32.safeParse(valid).success).toBe(true);
        expect(validators.Uint8Array32.safeParse(invalid1).success).toBe(false);
        expect(validators.Uint8Array32.safeParse(invalid2).success).toBe(false);
    });
});

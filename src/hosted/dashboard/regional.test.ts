/*
 * Copyright (c) 2026, Psiphon Inc.
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
import {
    normalizeRegionalMapKey,
    toRegionalImpactIntensity,
    toRegionalImpactOpacity,
    toRegionalMapLookupKeys,
} from "@/src/hosted/dashboard/regional";

describe("regional dashboard map helpers", () => {
    it("uses log scaling so outliers do not consume all color", () => {
        expect(toRegionalImpactOpacity(0, 10, 1_000_000)).toBe(0);
        expect(toRegionalImpactIntensity(10, 10, 1_000_000)).toBeCloseTo(0.18);
        expect(toRegionalImpactIntensity(1_000, 10, 1_000_000)).toBeGreaterThan(
            0.45,
        );
        expect(toRegionalImpactOpacity(1_000_000, 10, 1_000_000)).toBe(1);
    });

    it("normalizes country names for asset lookup", () => {
        expect(normalizeRegionalMapKey("United States of America")).toBe(
            "UNITEDSTATESOFAMERICA",
        );
    });

    it("adds a small override set for asset name mismatches", () => {
        expect(
            toRegionalMapLookupKeys("US", {
                US: "United States",
            }),
        ).toContain("UNITEDSTATESOFAMERICA");
        expect(
            toRegionalMapLookupKeys("RU", {
                RU: "Russia",
            }),
        ).toContain("RUSSIANFEDERATION");
        expect(
            toRegionalMapLookupKeys("SY", {
                SY: "Syrian Arab Republic",
            }),
        ).toContain("SYRIA");
        expect(
            toRegionalMapLookupKeys("LY", {
                LY: "Libyan Arab Jamahiriya",
            }),
        ).toContain("LIBYA");
    });
});

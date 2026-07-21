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
    calculateOrbGlowGradientStops,
    calculateOrbMorphClipBounds,
} from "@/src/components/orb-scene/orbSceneMath";

describe("calculateOrbGlowGradientStops", () => {
    it("keeps a solid core and samples a Gaussian tail through 3 sigma", () => {
        const stops = calculateOrbGlowGradientStops(90, 18);

        expect(stops.outerRadius).toBe(144);
        expect(stops.positions).toEqual([0, 0.625, 0.75, 0.875, 1]);
        expect(stops.alphaMultipliers).toEqual([
            1,
            1,
            Math.exp(-0.5),
            Math.exp(-2),
            0,
        ]);
    });

    it("clamps negative geometry inputs", () => {
        expect(calculateOrbGlowGradientStops(-10, -2)).toEqual({
            outerRadius: 0,
            positions: [0, 0, 0, 0, 0],
            alphaMultipliers: [1, 1, Math.exp(-0.5), Math.exp(-2), 0],
        });
    });
});

describe("calculateOrbMorphClipBounds", () => {
    it("unions animated orb and proxy support", () => {
        expect(
            calculateOrbMorphClipBounds(
                500,
                400,
                [
                    { centerX: 100, centerY: 100, radius: 40, proxyReach: 70 },
                    { centerX: 300, centerY: 220, radius: 80, proxyReach: 90 },
                ],
                15,
                2,
            ),
        ).toEqual({ x: 13, y: 13, width: 404, height: 324 });
    });

    it("clamps the union to the canvas", () => {
        expect(
            calculateOrbMorphClipBounds(
                200,
                100,
                [{ centerX: 20, centerY: 90, radius: 80, proxyReach: 0 }],
                15,
                2,
            ),
        ).toEqual({ x: 0, y: 0, width: 137, height: 100 });
    });
});

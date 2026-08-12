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
 */
import { sliderFillWidth } from "@/src/components/EditableNumberSlider";

describe("sliderFillWidth", () => {
    it("ends the fill at the thumb center in track-relative coordinates", () => {
        expect(sliderFillWidth(90, 10, 160)).toBe(80);
    });

    it("clamps the fill to the track bounds", () => {
        expect(sliderFillWidth(5, 10, 160)).toBe(0);
        expect(sliderFillWidth(200, 10, 160)).toBe(160);
    });
});

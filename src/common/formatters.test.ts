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
import { formatBytes } from "@/src/common/formatters";

// These tests lock in the exact output each consumer currently relies on:
// - default (significant): HostedStatusPanel chart axis labels
// - fixed + GB max: hosted-dashboard totals and regional breakdown
// - fixed + kB casing + TB max: Hosted/LocalConduitModal labels

describe("formatBytes significant-digit default (chart axis)", () => {
    test.each([
        [0, "0 B"],
        [512, "512 B"],
        [1500, "1.500 KB"],
        [999_949, "999.9 KB"],
        [1_500_000, "1.500 MB"],
        [2_500_000_000, "2.500 GB"],
        [3_200_000_000_000, "3.200 TB"],
    ])("formats %d as %s", (input, expected) => {
        expect(formatBytes(input)).toBe(expected);
    });

    test("handles non-finite input", () => {
        expect(formatBytes(NaN)).toBe("0 B");
        expect(formatBytes(Infinity)).toBe("0 B");
    });
});

describe("formatBytes fixed precision with GB max (hosted dashboard)", () => {
    test.each([
        [0, "0 B"],
        [512, "512 B"],
        [1500, "1.5 KB"],
        [999_949, "999.9 KB"],
        [1_500_000, "1.5 MB"],
        [2_500_000_000, "2.50 GB"],
        [3_200_000_000_000, "3200.00 GB"],
    ])("formats %d as %s", (input, expected) => {
        expect(formatBytes(input, { precision: "fixed", maxUnit: "GB" })).toBe(
            expected,
        );
    });

    test("clamps non-finite and non-positive input to 0 B", () => {
        expect(formatBytes(NaN, { precision: "fixed", maxUnit: "GB" })).toBe(
            "0 B",
        );
        expect(formatBytes(-5, { precision: "fixed", maxUnit: "GB" })).toBe(
            "0 B",
        );
    });
});

describe("formatBytes fixed precision with kB/TB units (conduit modals)", () => {
    test.each([
        [0, "0 B"],
        [512, "512 B"],
        [1500, "1.5 kB"],
        [999_949, "999.9 kB"],
        [1_500_000, "1.5 MB"],
        [2_500_000_000, "2.5 GB"],
        [3_200_000_000_000, "3.20 TB"],
    ])("formats %d as %s", (input, expected) => {
        expect(
            formatBytes(input, { precision: "fixed", lowercaseKilo: true }),
        ).toBe(expected);
    });
});

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
import { buildPairingShareOutput } from "@/src/pairing/token";

describe("pairing token", () => {
    it("keeps pairing share output aligned with fixtures", () => {
        const share = buildPairingShareOutput(
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "Example Test Conduit",
        );

        expect(share.rawToken).toBe(
            "eyJ2IjoiMSIsImRhdGEiOnsiaWQiOiJBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBIiwibmFtZSI6IkV4YW1wbGUgVGVzdCBDb25kdWl0In19",
        );
        expect(
            buildPairingShareOutput(
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                "Example Test Conduit",
                "https://pairing.example.test",
            ).wrapperUrl,
        ).toBe(
            "https://pairing.example.test/pair/eyJ2IjoiMSIsImRhdGEiOnsiaWQiOiJBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBIiwibmFtZSI6IkV4YW1wbGUgVGVzdCBDb25kdWl0In19",
        );
        expect(share.wrapperUrl).toBeNull();
        expect(share.deepLink).toBe(
            "psiphon://pair/eyJ2IjoiMSIsImRhdGEiOnsiaWQiOiJBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBIiwibmFtZSI6IkV4YW1wbGUgVGVzdCBDb25kdWl0In19",
        );
    });

    it("normalizes wrapper urls when provided", () => {
        const share = buildPairingShareOutput(
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "Example Test Conduit",
            "https://pairing.example.test/",
        );

        expect(share.wrapperUrl).toBe(
            "https://pairing.example.test/pair/eyJ2IjoiMSIsImRhdGEiOnsiaWQiOiJBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBIiwibmFtZSI6IkV4YW1wbGUgVGVzdCBDb25kdWl0In19",
        );
    });

    it("rejects url-safe compartment IDs", () => {
        expect(() =>
            buildPairingShareOutput(
                "__________________________________________8",
                "Example Test Conduit",
            ),
        ).toThrow();
    });
});

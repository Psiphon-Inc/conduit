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
    generateEd25519KeyPair,
    keyPairToBase64nopad,
} from "@/src/common/cryptography";
import { InproxyParametersSchema, ProxyErrorSchema } from "@/src/inproxy/types";

describe("inproxy types", () => {
    const personalCompartmentId = "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g";

    function makeBaseParams() {
        const keyPair = generateEd25519KeyPair();
        if (keyPair instanceof Error) {
            throw keyPair;
        }

        const privateKey = keyPairToBase64nopad(keyPair);
        if (privateKey instanceof Error) {
            throw privateKey;
        }

        return {
            privateKey,
            maxClients: 25,
            maxPersonalClients: 5,
            personalCompartmentId,
            limitUpstreamBytesPerSecond: 2_000_000,
            limitDownstreamBytesPerSecond: 2_000_000,
        };
    }

    it("accepts ios unimplemented proxy errors", () => {
        expect(
            ProxyErrorSchema.parse({
                action: "unimplemented",
                message: "In-proxy station mode is not implemented on iOS",
            }),
        ).toEqual({
            action: "unimplemented",
            message: "In-proxy station mode is not implemented on iOS",
        });
    });

    it("accepts personal pairing parameters within the total cap", () => {
        expect(InproxyParametersSchema.parse(makeBaseParams())).toMatchObject({
            maxClients: 25,
            maxPersonalClients: 5,
            personalCompartmentId,
        });
    });

    it("rejects personal peers without a personal compartment ID", () => {
        expect(() =>
            InproxyParametersSchema.parse({
                ...makeBaseParams(),
                personalCompartmentId: undefined,
            }),
        ).toThrow("Personal compartment ID is required");
    });

    it("rejects combined peers above the total cap", () => {
        expect(() =>
            InproxyParametersSchema.parse({
                ...makeBaseParams(),
                maxPersonalClients: 6,
            }),
        ).toThrow("Combined max clients cannot exceed total cap");
    });
});

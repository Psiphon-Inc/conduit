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
    buildPairingShareOutput,
    getConduitsPhase,
    normalizeConduitsSnapshot,
} from "@/src/hosted/conduits";

describe("hosted conduits", () => {
    it("supports deterministic conduits phase mapping", () => {
        expect(
            getConduitsPhase({
                entitlement: { status: "inactive" },
                conduits: [],
            }),
        ).toBe("none");

        expect(
            getConduitsPhase({
                entitlement: { status: "active" },
                conduits: [
                    {
                        conduit_id: "c_1",
                        proxy_id: "s_1",
                        status: "provisioning",
                    },
                ],
            }),
        ).toBe("provisioning");

        expect(
            getConduitsPhase({
                entitlement: { status: "active" },
                conduits: [
                    {
                        conduit_id: "c_1",
                        proxy_id: "s_1",
                        status: "active",
                    },
                    {
                        conduit_id: "c_2",
                        proxy_id: "s_2",
                        status: "suspended",
                    },
                ],
            }),
        ).toBe("active");

        expect(
            getConduitsPhase({
                entitlement: { status: "expired" },
                conduits: [
                    {
                        conduit_id: "c_1",
                        proxy_id: "s_1",
                        status: "suspended",
                    },
                ],
            }),
        ).toBe("suspended");
    });

    it("keeps pairing share output aligned with fixtures", () => {
        const share = buildPairingShareOutput(
            "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g",
            "mattereaterlad's conduit",
        );

        expect(share.rawToken).toBe(
            "eyJ2IjoiMSIsImRhdGEiOnsiaWQiOiJqZ3IrZmozeXo2V3BuL3ZWN3FsUDRTaCtoQmtUaFpDREVlNitPVkpFbTJnIiwibmFtZSI6Im1hdHRlcmVhdGVybGFkJ3MgY29uZHVpdCJ9fQ",
        );
        expect(
            buildPairingShareOutput(
                "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g",
                "mattereaterlad's conduit",
                "https://pairing.example.test",
            ).wrapperUrl,
        ).toBe(
            "https://pairing.example.test/pair/eyJ2IjoiMSIsImRhdGEiOnsiaWQiOiJqZ3IrZmozeXo2V3BuL3ZWN3FsUDRTaCtoQmtUaFpDREVlNitPVkpFbTJnIiwibmFtZSI6Im1hdHRlcmVhdGVybGFkJ3MgY29uZHVpdCJ9fQ",
        );
        expect(share.wrapperUrl).toBeNull();
        expect(share.deepLink).toBe(
            "psiphon://pair/eyJ2IjoiMSIsImRhdGEiOnsiaWQiOiJqZ3IrZmozeXo2V3BuL3ZWN3FsUDRTaCtoQmtUaFpDREVlNitPVkpFbTJnIiwibmFtZSI6Im1hdHRlcmVhdGVybGFkJ3MgY29uZHVpdCJ9fQ",
        );
    });

    it("normalizes wrapper urls when provided", () => {
        const share = buildPairingShareOutput(
            "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g",
            "mattereaterlad's conduit",
            "https://pairing.example.test/",
        );

        expect(share.wrapperUrl).toBe(
            "https://pairing.example.test/pair/eyJ2IjoiMSIsImRhdGEiOnsiaWQiOiJqZ3IrZmozeXo2V3BuL3ZWN3FsUDRTaCtoQmtUaFpDREVlNitPVkpFbTJnIiwibmFtZSI6Im1hdHRlcmVhdGVybGFkJ3MgY29uZHVpdCJ9fQ",
        );
    });

    it("rejects url-safe compartment IDs", () => {
        expect(() =>
            buildPairingShareOutput(
                "_oSUwzsuXyrmfOTdg5RDMjmVgZpumxgya8rTgNySIyw",
                "My conduit",
            ),
        ).toThrow();
    });

    it("parses known active conduits snapshot shape", () => {
        const snapshot = normalizeConduitsSnapshot({
            entitlement: {
                status: "active",
                product_id: "test.product.primary",
                expires_at: "2026-03-10T12:00:00Z",
            },
            conduits: [
                {
                    conduit_id: "cond_123",
                    proxy_id: "j76IhlV2wG0gH9BIcgAgKpbvDf8JKVh71IUDGOr2y2A",
                    role: "common",
                    traffic_scope: "public",
                    status: "active",
                    personal_compartment_id:
                        "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g",
                    common_compartment_id:
                        "N8nN1DTLcuNj3DG39uUyIqBP-xKujq6IAklKO1f1Ftk",
                    inproxy_public_key:
                        "jhfnSsQQyqWEhjUBtp_ypNnefb7tjv6iF9BxzH-_Yis",
                    ryve_claim: {
                        version: 1,
                        key: "example-hosted-key",
                        default_name: "Common hosted conduit",
                    },
                    poll_after_seconds: 60,
                },
            ],
            poll_after_seconds: 60,
        });

        expect(snapshot.conduits[0].status).toBe("active");
        expect(snapshot.conduits[0].inproxy_public_key).toBe(
            "jhfnSsQQyqWEhjUBtp_ypNnefb7tjv6iF9BxzH-_Yis",
        );
        expect(snapshot.conduits[0].role).toBe("common");
        expect(snapshot.conduits[0].ryve_claim?.default_name).toBe(
            "Common hosted conduit",
        );
    });
});

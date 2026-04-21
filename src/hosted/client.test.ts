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
    HostedAccountProfileConflictError,
    HostedPersonalCompartmentIdConflictError,
    createHostedClient,
} from "@/src/hosted/client";

describe("hosted client contracts", () => {
    it("requests conduits snapshot from /v1/conduits", async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            text: async () =>
                JSON.stringify({
                    entitlement: {
                        status: "active",
                    },
                    conduits: [
                        {
                            conduit_id: "cond_1",
                            proxy_id: "st_1",
                            status: "active",
                        },
                    ],
                    poll_after_seconds: 30,
                }),
        });
        const client = createHostedClient({
            baseUrl: "https://hcb.example.test",
            fetchImpl,
        });

        await client.getConduitsSnapshot("access-token");

        expect(fetchImpl).toHaveBeenCalledWith(
            "https://hcb.example.test/v1/conduits",
            expect.objectContaining({
                headers: expect.objectContaining({
                    authorization: "Bearer access-token",
                }),
            }),
        );
    });

    it("requests plan catalog with required query parameters", async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            text: async () =>
                JSON.stringify({
                    catalogVersion: "2026-02-09.1",
                    generatedAt: "2026-02-09T18:00:00Z",
                    currencyDisplayMode: "revenuecat_price_string",
                    fallbackPolicy: {
                        unmappedRevenueCatPackage: "show_generic",
                    },
                    plans: [],
                }),
        });
        const client = createHostedClient({
            baseUrl: "https://hcb.example.test",
            fetchImpl,
        });

        await client.getPlanCatalog("access-token", {
            platform: "ios",
            locale: "en-US",
            appVersion: "1.8.0",
            buildNumber: "10800",
            country: "US",
        });

        expect(fetchImpl).toHaveBeenCalledWith(
            "https://hcb.example.test/v1/hosted/plan-catalog?platform=ios&locale=en-US&appVersion=1.8.0&buildNumber=10800&country=US",
            expect.objectContaining({
                headers: expect.objectContaining({
                    authorization: "Bearer access-token",
                }),
            }),
        );
    });

    it("reads and updates account profile with optimistic concurrency", async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                text: async () =>
                    JSON.stringify({
                        account: {
                            account_id: "acc_123",
                            alias: "Station One",
                            alias_is_default: false,
                            alias_updated_at: "2026-03-22T12:00:00Z",
                            profile_version: 3,
                        },
                    }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () =>
                    JSON.stringify({
                        account: {
                            account_id: "acc_123",
                            alias: "Station Two",
                            alias_is_default: false,
                            alias_updated_at: "2026-03-22T12:01:00Z",
                            profile_version: 4,
                        },
                    }),
            });
        const client = createHostedClient({
            baseUrl: "https://hcb.example.test",
            fetchImpl,
        });

        await expect(client.getAccountProfile("access-token")).resolves.toEqual(
            {
                account_id: "acc_123",
                alias: "Station One",
                alias_is_default: false,
                alias_updated_at: "2026-03-22T12:00:00Z",
                profile_version: 3,
            },
        );
        await expect(
            client.updateAccountProfile("access-token", {
                alias: "Station Two",
                expected_profile_version: 3,
            }),
        ).resolves.toEqual({
            account_id: "acc_123",
            alias: "Station Two",
            alias_is_default: false,
            alias_updated_at: "2026-03-22T12:01:00Z",
            profile_version: 4,
        });

        expect(fetchImpl).toHaveBeenNthCalledWith(
            1,
            "https://hcb.example.test/v1/account/profile",
            expect.objectContaining({
                method: "GET",
                headers: expect.objectContaining({
                    authorization: "Bearer access-token",
                }),
            }),
        );
        expect(fetchImpl).toHaveBeenNthCalledWith(
            2,
            "https://hcb.example.test/v1/account/profile",
            expect.objectContaining({
                method: "PATCH",
                headers: expect.objectContaining({
                    authorization: "Bearer access-token",
                    "content-type": "application/json",
                }),
                body: JSON.stringify({
                    alias: "Station Two",
                    expected_profile_version: 3,
                }),
            }),
        );
    });

    it("surfaces profile conflicts with the current server profile", async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: false,
            status: 409,
            text: async () =>
                JSON.stringify({
                    account: {
                        account_id: "acc_123",
                        alias: "Server Alias",
                        alias_is_default: false,
                        alias_updated_at: "2026-03-22T12:02:00Z",
                        profile_version: 9,
                    },
                }),
        });
        const client = createHostedClient({
            baseUrl: "https://hcb.example.test",
            fetchImpl,
        });

        await expect(
            client.updateAccountProfile("access-token", {
                alias: "Local Alias",
                expected_profile_version: 8,
            }),
        ).rejects.toEqual(
            expect.objectContaining<Partial<HostedAccountProfileConflictError>>(
                {
                    name: "HostedAccountProfileConflictError",
                    currentProfile: {
                        account_id: "acc_123",
                        alias: "Server Alias",
                        alias_is_default: false,
                        alias_updated_at: "2026-03-22T12:02:00Z",
                        profile_version: 9,
                    },
                },
            ),
        );
    });

    it("sets personal compartment id after login with bearer auth", async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () =>
                JSON.stringify({
                    personal_compartment_id:
                        "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g",
                }),
        });

        const client = createHostedClient({
            baseUrl: "https://hcb.example.test",
            fetchImpl,
        });

        await expect(
            client.setPersonalCompartmentId(
                "access-token",
                "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g",
            ),
        ).resolves.toBe("jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g");

        expect(fetchImpl).toHaveBeenCalledWith(
            "https://hcb.example.test/v1/account/personal-compartment-id",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    authorization: "Bearer access-token",
                    "content-type": "application/json",
                }),
                body: JSON.stringify({
                    personal_compartment_id:
                        "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g",
                }),
            }),
        );
    });

    it("surfaces personal compartment id conflicts with current server value", async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: false,
            status: 409,
            text: async () =>
                JSON.stringify({
                    error: {
                        code: "personal_compartment_id_conflict",
                        message:
                            "Account already has a different personal compartment ID.",
                    },
                    current_personal_compartment_id:
                        "N8nN1DTLcuNj3DG39uUyIqBP+xKujq6IAklKO1f1Ftk",
                }),
        });

        const client = createHostedClient({
            baseUrl: "https://hcb.example.test",
            fetchImpl,
        });

        await expect(
            client.setPersonalCompartmentId(
                "access-token",
                "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g",
            ),
        ).rejects.toEqual(
            expect.objectContaining<
                Partial<HostedPersonalCompartmentIdConflictError>
            >({
                name: "HostedPersonalCompartmentIdConflictError",
                currentPersonalCompartmentId:
                    "N8nN1DTLcuNj3DG39uUyIqBP+xKujq6IAklKO1f1Ftk",
            }),
        );
    });

    it("posts stats session and accepts scoped targets", async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            text: async () =>
                JSON.stringify({
                    stats_token: "stats-1",
                    expires_in_seconds: 900,
                    targets: [
                        {
                            proxy_id: "proxy-a",
                            source: "hosted",
                        },
                    ],
                }),
        });
        const client = createHostedClient({
            baseUrl: "https://hcb.example.test",
            fetchImpl,
        });

        await client.createStatsSession("access-token", {
            local_proxy_ids: ["local-a", "local-b"],
        });

        expect(fetchImpl).toHaveBeenCalledWith(
            "https://hcb.example.test/v1/stats/session",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    local_proxy_ids: ["local-a", "local-b"],
                }),
            }),
        );
    });

    it("adds proxy_id when querying summary, recent, and live", async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                text: async () =>
                    JSON.stringify({
                        window: "24h",
                        generated_at: "2026-02-06T20:00:00Z",
                        proxy_id: "proxy-a",
                        segments: {
                            personal: {
                                active_users: 1,
                                connecting_users: 2,
                                bytes_up: 2,
                                bytes_down: 3,
                            },
                            public: {
                                active_users: 4,
                                connecting_users: 5,
                                bytes_up: 5,
                                bytes_down: 6,
                            },
                        },
                    }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () =>
                    JSON.stringify({
                        window: "5m",
                        bucket_seconds: 60,
                        generated_at: "2026-02-06T20:00:00Z",
                        proxy_id: "proxy-a",
                        series: [
                            {
                                ts: "2026-02-06T20:00:00Z",
                                personal_active_users: 1,
                                public_active_users: 2,
                                personal_connecting_users: 3,
                                public_connecting_users: 4,
                                personal_bytes_transferred: 500,
                                public_bytes_transferred: 700,
                                bytes_up: 50,
                                bytes_down: 80,
                            },
                        ],
                    }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () =>
                    JSON.stringify({
                        generated_at: "2026-02-06T20:00:00Z",
                        proxy_id: "proxy-a",
                        announcing: 1,
                        segments: {
                            personal: {
                                connected_users: 5,
                                connecting_users: 1,
                                bytes_up_total: 123,
                                bytes_down_total: 456,
                            },
                            public: {
                                connected_users: 7,
                                connecting_users: 2,
                                bytes_up_total: 789,
                                bytes_down_total: 999,
                            },
                            total: {
                                connected_users: 12,
                                connecting_users: 3,
                                bytes_up_total: 912,
                                bytes_down_total: 1455,
                            },
                        },
                        personal_region_activity: [
                            {
                                region: "US",
                                connected_users: 3,
                                connecting_users: 1,
                                bytes_up_total: 50,
                                bytes_down_total: 70,
                            },
                        ],
                        public_region_activity: [
                            {
                                region: "BR",
                                connected_users: 4,
                                connecting_users: 0,
                                bytes_up_total: 80,
                                bytes_down_total: 90,
                            },
                        ],
                    }),
            });

        const client = createHostedClient({
            baseUrl: "https://hcb.example.test",
            fetchImpl,
        });

        await client.getSummary("stats-token", "24h", "proxy-a");
        await client.getRecent("stats-token", "5m", "proxy-a");
        await client.getLive("stats-token", "proxy-a");

        expect(fetchImpl).toHaveBeenNthCalledWith(
            1,
            "https://hcb.example.test/v1/stats/summary?window=24h&proxy_id=proxy-a",
            expect.any(Object),
        );
        expect(fetchImpl).toHaveBeenNthCalledWith(
            2,
            "https://hcb.example.test/v1/stats/recent?window=5m&proxy_id=proxy-a",
            expect.any(Object),
        );
        expect(fetchImpl).toHaveBeenNthCalledWith(
            3,
            "https://hcb.example.test/v1/stats/live?proxy_id=proxy-a",
            expect.any(Object),
        );
    });
});

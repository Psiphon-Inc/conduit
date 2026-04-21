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
import * as SecureStore from "expo-secure-store";

import { SECURESTORE_HOSTED_SESSION_KEY } from "@/src/constants";
import {
    HostedApiRequestError,
    createHostedSessionClient,
} from "@/src/hosted/sessionClient";

describe("hosted session client", () => {
    beforeEach(async () => {
        (
            SecureStore as unknown as { __resetStore?: () => void }
        ).__resetStore?.();
    });

    it("logs in with broker token and persists a session", async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            text: async () =>
                JSON.stringify({
                    account_id: "acc_6f3e6b6e-392e-41a2-bbbf-7f0f7f3f8a61",
                    access_token:
                        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.access.payload.signature",
                    access_token_expires_in_seconds: 900,
                    refresh_token: "rtok_2bc588a8cc904bd286b1",
                    refresh_token_expires_in_seconds: 2592000,
                    personal_pairing_wrapper_base_url:
                        "https://pairing.example.test",
                }),
        });

        const client = createHostedSessionClient({
            baseUrl: "https://hcb.example.test",
            fetchImpl,
            now: () => 1000,
        });

        const session = await client.login({
            token_type: "clerk_broker_jwt",
            broker_token: "clerk-broker-jwt-sandbox-abc123",
            platform: "android",
            client_version: "1.0.0",
        });

        expect(session.accountId).toBe(
            "acc_6f3e6b6e-392e-41a2-bbbf-7f0f7f3f8a61",
        );
        expect(session.accessTokenExpiresAtMs).toBe(901000);
        expect(session.personalPairingWrapperBaseUrl).toBe(
            "https://pairing.example.test",
        );
        expect(fetchImpl).toHaveBeenCalledWith(
            "https://hcb.example.test/auth/oauth/login",
            expect.objectContaining({ method: "POST" }),
        );
        expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
            expect.stringMatching(/^hostedSession[._-][A-Za-z0-9._-]+$/),
            expect.any(String),
        );
        await expect(client.loadHostedSession()).resolves.toEqual(session);
    });

    it("refreshes access token and rotates refresh token when present", async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                text: async () =>
                    JSON.stringify({
                        account_id: "acc_6f3e6b6e-392e-41a2-bbbf-7f0f7f3f8a61",
                        access_token: "access.old",
                        access_token_expires_in_seconds: 900,
                        refresh_token: "refresh.old",
                        refresh_token_expires_in_seconds: 2592000,
                        personal_pairing_wrapper_base_url:
                            "https://pairing.old.example.test",
                    }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () =>
                    JSON.stringify({
                        access_token: "access.new",
                        access_token_expires_in_seconds: 900,
                        refresh_token: "refresh.new",
                        refresh_token_expires_in_seconds: 2592000,
                        personal_pairing_wrapper_base_url:
                            "https://pairing.new.example.test",
                    }),
            });

        const client = createHostedSessionClient({
            baseUrl: "https://hcb.example.test",
            fetchImpl,
            now: () => 2000,
        });

        await client.login({
            token_type: "clerk_broker_jwt",
            broker_token: "clerk-broker-jwt-sandbox-abc123",
            platform: "android",
            client_version: "1.0.0",
        });

        const refreshed = await client.refresh();
        expect(refreshed.accessToken).toBe("access.new");
        expect(refreshed.refreshToken).toBe("refresh.new");
        expect(refreshed.personalPairingWrapperBaseUrl).toBe(
            "https://pairing.new.example.test",
        );
        expect(fetchImpl).toHaveBeenLastCalledWith(
            "https://hcb.example.test/auth/refresh",
            expect.objectContaining({ method: "POST" }),
        );
    });

    it("deduplicates concurrent refresh calls", async () => {
        const deferred: {
            resolve: (value: unknown) => void;
            promise: Promise<unknown>;
        } = {
            resolve: () => undefined,
            promise: Promise.resolve(undefined),
        };
        deferred.promise = new Promise((resolve) => {
            deferred.resolve = resolve;
        });

        const fetchImpl = jest
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                text: async () =>
                    JSON.stringify({
                        account_id: "acc_6f3e6b6e-392e-41a2-bbbf-7f0f7f3f8a61",
                        access_token: "access.old",
                        access_token_expires_in_seconds: 900,
                        refresh_token: "refresh.old",
                        refresh_token_expires_in_seconds: 2592000,
                    }),
            })
            .mockImplementationOnce(async () => {
                await deferred.promise;
                return {
                    ok: true,
                    text: async () =>
                        JSON.stringify({
                            access_token: "access.new",
                            access_token_expires_in_seconds: 900,
                            refresh_token: "refresh.new",
                            refresh_token_expires_in_seconds: 2592000,
                        }),
                };
            });

        const client = createHostedSessionClient({
            baseUrl: "https://hcb.example.test",
            fetchImpl,
            now: () => 3000,
        });

        await client.login({
            token_type: "clerk_broker_jwt",
            broker_token: "clerk-broker-jwt-sandbox-abc123",
            platform: "android",
            client_version: "1.0.0",
        });

        const refreshA = client.refresh();
        const refreshB = client.refresh();

        deferred.resolve(undefined);

        const [sessionA, sessionB] = await Promise.all([refreshA, refreshB]);
        expect(sessionA.refreshToken).toBe("refresh.new");
        expect(sessionB.refreshToken).toBe("refresh.new");
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(fetchImpl).toHaveBeenLastCalledWith(
            "https://hcb.example.test/auth/refresh",
            expect.objectContaining({ method: "POST" }),
        );
    });

    it("surfaces api contract errors", async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: false,
            status: 401,
            text: async () =>
                JSON.stringify({
                    error: {
                        code: "auth.invalid_broker_token",
                        message: "Broker token could not be verified",
                    },
                }),
        });

        const client = createHostedSessionClient({
            baseUrl: "https://hcb.example.test",
            fetchImpl,
        });

        await expect(
            client.login({
                token_type: "clerk_broker_jwt",
                broker_token: "bad-token",
                platform: "android",
                client_version: "1.0.0",
            }),
        ).rejects.toEqual(
            expect.objectContaining<Partial<HostedApiRequestError>>({
                name: "HostedApiRequestError",
                status: 401,
                code: "auth.invalid_broker_token",
            }),
        );
    });

    it("keeps hosted sessions isolated by base URL", async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            text: async () =>
                JSON.stringify({
                    account_id: "acc_primary",
                    access_token: "access.primary",
                    access_token_expires_in_seconds: 900,
                    refresh_token: "refresh.primary",
                    refresh_token_expires_in_seconds: 2592000,
                }),
        });

        const primaryClient = createHostedSessionClient({
            baseUrl: "https://hcb.example.test",
            fetchImpl,
            now: () => 4000,
        });
        const secondaryClient = createHostedSessionClient({
            baseUrl: "https://staging.example.test",
            fetchImpl,
            now: () => 4000,
        });

        await primaryClient.login({
            token_type: "clerk_broker_jwt",
            broker_token: "clerk-broker-jwt-sandbox-abc123",
            platform: "android",
            client_version: "1.0.0",
        });

        await expect(primaryClient.loadHostedSession()).resolves.toEqual(
            expect.objectContaining({ accountId: "acc_primary" }),
        );
        await expect(secondaryClient.loadHostedSession()).resolves.toBeNull();
    });

    it("migrates the legacy unscoped hosted session into the current backend scope", async () => {
        await SecureStore.setItemAsync(
            SECURESTORE_HOSTED_SESSION_KEY,
            JSON.stringify({
                accountId: "acc_legacy",
                accessToken: "access.legacy",
                accessTokenExpiresAtMs: 5000,
                refreshToken: "refresh.legacy",
                refreshTokenExpiresAtMs: 6000,
                personalPairingWrapperBaseUrl: null,
                accountProfile: null,
            }),
        );

        const client = createHostedSessionClient({
            baseUrl: "https://hcb.example.test/",
        });

        await expect(client.loadHostedSession()).resolves.toEqual({
            accountId: "acc_legacy",
            accessToken: "access.legacy",
            accessTokenExpiresAtMs: 5000,
            refreshToken: "refresh.legacy",
            refreshTokenExpiresAtMs: 6000,
            personalPairingWrapperBaseUrl: null,
            accountProfile: null,
        });
        await expect(
            SecureStore.getItemAsync(SECURESTORE_HOSTED_SESSION_KEY),
        ).resolves.toBeNull();
    });
});

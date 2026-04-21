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
import { createHostedAppleAuthAdapter } from "@/src/hosted/auth/apple";
import { createHostedGoogleAuthAdapter } from "@/src/hosted/auth/google";
import {
    createHostedAuthService,
    createStubHostedAuthService,
} from "@/src/hosted/auth/service";
import { HostedAuthServiceError } from "@/src/hosted/auth/types";

describe("hosted auth service", () => {
    it("returns provider payload without mutating broker token", async () => {
        const service = createHostedAuthService({
            adapters: {
                google: createHostedGoogleAuthAdapter({
                    signInImpl: async () => ({
                        tokenType: "clerk_broker_jwt",
                        brokerToken: "broker.jwt.token.abc",
                        platform: "android",
                        clientVersion: "1.2.3",
                    }),
                }),
                apple: createHostedAppleAuthAdapter(),
            },
        });

        await expect(service.signIn("google")).resolves.toEqual({
            provider: "google",
            tokenType: "clerk_broker_jwt",
            brokerToken: "broker.jwt.token.abc",
            platform: "android",
            clientVersion: "1.2.3",
        });
    });

    it("maps invalid adapter payloads to user-safe invalid_response errors", async () => {
        const service = createHostedAuthService({
            adapters: {
                google: createHostedGoogleAuthAdapter({
                    signInImpl: async () => ({
                        tokenType: "clerk_broker_jwt",
                        brokerToken: "",
                        platform: "android",
                        clientVersion: "1.2.3",
                    }),
                }),
                apple: createHostedAppleAuthAdapter(),
            },
        });

        await expect(service.signIn("google")).rejects.toEqual(
            expect.objectContaining<Partial<HostedAuthServiceError>>({
                name: "HostedAuthServiceError",
                code: "invalid_response",
                userMessage:
                    "Sign-in failed because broker data was incomplete.",
            }),
        );
    });

    it("maps cancellation-like errors from providers", async () => {
        const service = createHostedAuthService({
            adapters: {
                google: createHostedGoogleAuthAdapter({
                    signInImpl: async () => {
                        throw Object.assign(
                            new Error("Flow cancelled by user"),
                            {
                                name: "AbortError",
                            },
                        );
                    },
                }),
                apple: createHostedAppleAuthAdapter(),
            },
        });

        await expect(service.signIn("google")).rejects.toEqual(
            expect.objectContaining<Partial<HostedAuthServiceError>>({
                name: "HostedAuthServiceError",
                code: "cancelled",
                userMessage: "Sign-in was cancelled.",
            }),
        );
    });

    it("uses unavailable stubs when no provider adapters are implemented yet", async () => {
        const service = createStubHostedAuthService();

        await expect(service.signIn("google")).rejects.toEqual(
            expect.objectContaining<Partial<HostedAuthServiceError>>({
                name: "HostedAuthServiceError",
                code: "unavailable",
            }),
        );
        await expect(service.signIn("apple")).rejects.toEqual(
            expect.objectContaining<Partial<HostedAuthServiceError>>({
                name: "HostedAuthServiceError",
                code: "unavailable",
            }),
        );
        await expect(service.restoreSignIn("google")).resolves.toBeNull();
        await expect(service.signOut()).resolves.toBeUndefined();
    });
});

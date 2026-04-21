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
import { z } from "zod";

import { createHostedAppleAuthAdapter } from "@/src/hosted/auth/apple";
import { createHostedGoogleAuthAdapter } from "@/src/hosted/auth/google";
import {
    HostedAuthAdapterMap,
    HostedAuthAdapterResultSchema,
    HostedAuthService,
    HostedAuthServiceError,
    HostedAuthSignInResult,
} from "@/src/hosted/auth/types";
import { OAuthProvider } from "@/src/hosted/contracts";

export interface HostedAuthServiceConfig {
    adapters: HostedAuthAdapterMap;
}

export function createHostedAuthService(
    config: HostedAuthServiceConfig,
): HostedAuthService {
    return {
        async signIn(provider: OAuthProvider): Promise<HostedAuthSignInResult> {
            const adapter = config.adapters[provider];
            if (!adapter) {
                throw new HostedAuthServiceError({
                    code: "unavailable",
                    message: `No auth adapter configured for provider: ${provider}`,
                    userMessage:
                        "This sign-in method is not available right now.",
                });
            }

            try {
                const adapterResult = HostedAuthAdapterResultSchema.parse(
                    await adapter.signIn(),
                );
                return {
                    provider,
                    tokenType: adapterResult.tokenType,
                    brokerToken: adapterResult.brokerToken,
                    platform: adapterResult.platform,
                    clientVersion: adapterResult.clientVersion,
                };
            } catch (error) {
                throw toHostedAuthServiceError(error);
            }
        },
        async restoreSignIn(): Promise<HostedAuthSignInResult | null> {
            return null;
        },
        async signOut(): Promise<void> {},
    };
}

export function createStubHostedAuthService(): HostedAuthService {
    return createHostedAuthService({
        adapters: {
            google: createHostedGoogleAuthAdapter(),
            apple: createHostedAppleAuthAdapter(),
        },
    });
}

export function toHostedAuthServiceError(
    error: unknown,
): HostedAuthServiceError {
    if (error instanceof HostedAuthServiceError) {
        return error;
    }

    if (isAbortError(error)) {
        return new HostedAuthServiceError({
            code: "cancelled",
            message: "Hosted sign-in was cancelled",
            userMessage: "Sign-in was cancelled.",
            cause: error,
        });
    }

    if (error instanceof z.ZodError) {
        return new HostedAuthServiceError({
            code: "invalid_response",
            message: "Broker sign-in returned invalid payload",
            userMessage: "Sign-in failed because broker data was incomplete.",
            cause: error,
        });
    }

    return new HostedAuthServiceError({
        code: "unknown",
        message:
            error instanceof Error
                ? error.message
                : "Hosted sign-in failed with unknown error",
        userMessage: "Sign-in failed. Please try again.",
        cause: error,
    });
}

function isAbortError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as { name?: unknown; message?: unknown };
    const name = typeof candidate.name === "string" ? candidate.name : "";
    const message =
        typeof candidate.message === "string"
            ? candidate.message.toLowerCase()
            : "";
    return (
        name === "AbortError" ||
        message.includes("cancel") ||
        message.includes("canceled") ||
        message.includes("cancelled")
    );
}

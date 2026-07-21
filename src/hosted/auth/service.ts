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

import { HOSTED_SIGN_IN_METHOD_UNAVAILABLE_MESSAGE } from "@/src/hosted/auth/messages";
import {
    HostedAuthAdapter,
    HostedAuthAdapterMap,
    HostedAuthAdapterResultSchema,
    HostedAuthService,
    HostedAuthServiceError,
    HostedAuthSignInResult,
} from "@/src/hosted/auth/types";
import { OAuthProvider } from "@/src/hosted/contracts";

interface HostedAuthServiceConfig {
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
                    userMessage: HOSTED_SIGN_IN_METHOD_UNAVAILABLE_MESSAGE,
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
        async startEmailCodeSignIn(): Promise<void> {
            throw new HostedAuthServiceError({
                code: "unavailable",
                message: "Email-code sign-in is not available",
                userMessage: HOSTED_SIGN_IN_METHOD_UNAVAILABLE_MESSAGE,
            });
        },
        async completeEmailCodeSignIn(): Promise<HostedAuthSignInResult> {
            throw new HostedAuthServiceError({
                code: "unavailable",
                message: "Email-code sign-in is not available",
                userMessage: HOSTED_SIGN_IN_METHOD_UNAVAILABLE_MESSAGE,
            });
        },
        async signOut(): Promise<void> {},
    };
}

export function createStubHostedAuthService(): HostedAuthService {
    return createHostedAuthService({
        adapters: {
            google: createUnavailableAuthAdapter("Google"),
            apple: createUnavailableAuthAdapter("Apple"),
        },
    });
}

function createUnavailableAuthAdapter(
    providerLabel: "Google" | "Apple",
): HostedAuthAdapter {
    return {
        async signIn() {
            throw new HostedAuthServiceError({
                code: "unavailable",
                message: `${providerLabel} sign-in adapter is not implemented`,
                userMessage: `${providerLabel} sign-in is not available yet in this build.`,
            });
        },
    };
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

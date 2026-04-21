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
import { useAuth, useSSO } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import React from "react";
import { Platform } from "react-native";

import { timedLog } from "@/src/common/utils";
import { GIT_HASH } from "@/src/git-hash";
import { toHostedAuthServiceError } from "@/src/hosted/auth/service";
import {
    type HostedAuthService,
    HostedAuthServiceError,
    type HostedAuthSignInResult,
} from "@/src/hosted/auth/types";
import type {
    HostedBrokerTokenType,
    OAuthProvider,
} from "@/src/hosted/contracts";

type HostedClerkOAuthStrategy = "oauth_google" | "oauth_apple";

export function readHostedClerkPublishableKey(): string {
    const value = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (!value) {
        return "";
    }

    return value.trim();
}

export function readHostedClerkJwtTemplate(): string {
    const value = process.env.EXPO_PUBLIC_CLERK_HCB_JWT_TEMPLATE;
    if (!value) {
        return "hcb";
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : "hcb";
}

export function useHostedClerkAuthService(): HostedAuthService {
    const { startSSOFlow } = useSSO();
    const { getToken, signOut } = useAuth();

    return React.useMemo<HostedAuthService>(
        () => ({
            signIn: async (
                provider: OAuthProvider,
            ): Promise<HostedAuthSignInResult> => {
                try {
                    const strategy = toHostedClerkStrategy(provider);
                    const appScheme = resolveHostedRedirectScheme();
                    const redirectUrl = AuthSession.makeRedirectUri({
                        scheme: appScheme,
                        path: "sso-callback",
                    });
                    timedLog(
                        `Hosted Clerk SSO start: provider=${provider}, scheme=${appScheme}, redirectUrl=${redirectUrl}`,
                    );

                    await signOutIfSessionExists(getToken, signOut);

                    const { createdSessionId, setActive, authSessionResult } =
                        await startSsoFlowWithRetryOnSignedInError({
                            startSSOFlow,
                            strategy,
                            redirectUrl,
                            signOut,
                        });

                    const authResultType = authSessionResult?.type;
                    if (
                        authResultType === "cancel" ||
                        authResultType === "dismiss"
                    ) {
                        throw new HostedAuthServiceError({
                            code: "cancelled",
                            message: "OAuth sign-in was cancelled",
                            userMessage: "Sign-in was cancelled.",
                        });
                    }

                    if (!createdSessionId || !setActive) {
                        throw new HostedAuthServiceError({
                            code: "invalid_response",
                            message:
                                "Clerk sign-in did not return an active session id",
                            userMessage:
                                "Sign-in did not complete. Please try again.",
                        });
                    }

                    await setActive({ session: createdSessionId });
                    const sessionToken =
                        await getHostedClerkBrokerToken(getToken);
                    if (!sessionToken) {
                        throw new HostedAuthServiceError({
                            code: "invalid_response",
                            message:
                                "Clerk did not provide an HCB broker token after sign-in",
                            userMessage:
                                "Sign-in completed, but we could not verify your broker session.",
                        });
                    }

                    return createHostedAuthSignInResult(provider, sessionToken);
                } catch (error) {
                    const hostedError = toHostedAuthServiceError(error);
                    timedLog(
                        `Hosted Clerk SSO failed: ${formatErrorForLog(error)} (normalized: ${hostedError.message})`,
                    );
                    throw hostedError;
                }
            },
            restoreSignIn: async (
                provider: OAuthProvider,
            ): Promise<HostedAuthSignInResult | null> => {
                timedLog(`Hosted Clerk restore start: provider=${provider}`);
                try {
                    const sessionToken =
                        await tryGetHostedClerkBrokerToken(getToken);
                    if (!sessionToken) {
                        return null;
                    }

                    return createHostedAuthSignInResult(provider, sessionToken);
                } catch (error) {
                    const hostedError = toHostedAuthServiceError(error);
                    timedLog(
                        `Hosted Clerk restore failed: ${formatErrorForLog(error)} (normalized: ${hostedError.message})`,
                    );
                    return null;
                }
            },
            signOut: async (): Promise<void> => {
                if (!signOut) {
                    return;
                }
                await signOut();
            },
        }),
        [getToken, signOut, startSSOFlow],
    );
}

function resolveHostedRedirectScheme(): string {
    const envScheme = process.env.EXPO_PUBLIC_CLERK_REDIRECT_SCHEME?.trim();
    if (envScheme) {
        return envScheme;
    }

    if (Platform.OS === "android") {
        const packageName = Constants.expoConfig?.android?.package;
        if (packageName) {
            return packageName;
        }
    }

    if (Platform.OS === "ios") {
        const bundleIdentifier = Constants.expoConfig?.ios?.bundleIdentifier;
        if (bundleIdentifier) {
            return bundleIdentifier;
        }
    }

    const schemeConfig = Constants.expoConfig?.scheme;
    if (typeof schemeConfig === "string" && schemeConfig.trim().length > 0) {
        return schemeConfig;
    }

    return "conduit";
}

function formatErrorForLog(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function toHostedBrokerTokenType(): HostedBrokerTokenType {
    return "clerk_broker_jwt";
}

function toHostedClerkStrategy(
    provider: OAuthProvider,
): HostedClerkOAuthStrategy {
    if (provider === "google") {
        return "oauth_google";
    }

    return "oauth_apple";
}

function getHostedClientVersion(): string {
    const version = Constants.expoConfig?.version;
    if (!version) {
        return `conduit-${GIT_HASH}`;
    }
    return `conduit-${version}-${GIT_HASH}`;
}

async function getHostedClerkBrokerToken(
    getToken: (input?: { template?: string }) => Promise<string | null>,
): Promise<string | null> {
    return getToken({
        template: readHostedClerkJwtTemplate(),
    });
}

async function tryGetHostedClerkBrokerToken(
    getToken: (input?: { template?: string }) => Promise<string | null>,
): Promise<string | null> {
    try {
        return await getHostedClerkBrokerToken(getToken);
    } catch {
        return null;
    }
}

async function signOutIfSessionExists(
    getToken: (input?: { template?: string }) => Promise<string | null>,
    signOut?: () => Promise<unknown>,
): Promise<void> {
    if (!signOut) {
        return;
    }

    let existingToken: string | null;
    try {
        existingToken = await getHostedClerkBrokerToken(getToken);
    } catch {
        return;
    }
    if (!existingToken) {
        return;
    }

    await signOut();
}

async function startSsoFlowWithRetryOnSignedInError(input: {
    startSSOFlow: ReturnType<typeof useSSO>["startSSOFlow"];
    strategy: HostedClerkOAuthStrategy;
    redirectUrl: string;
    signOut?: () => Promise<unknown>;
}) {
    try {
        return await input.startSSOFlow({
            strategy: input.strategy,
            redirectUrl: input.redirectUrl,
        });
    } catch (error) {
        if (!isAlreadySignedInError(error) || !input.signOut) {
            throw error;
        }

        await input.signOut();
        return input.startSSOFlow({
            strategy: input.strategy,
            redirectUrl: input.redirectUrl,
        });
    }
}

function createHostedAuthSignInResult(
    provider: OAuthProvider,
    brokerToken: string,
): HostedAuthSignInResult {
    return {
        provider,
        tokenType: toHostedBrokerTokenType(),
        brokerToken,
        platform: Platform.OS === "ios" ? "ios" : "android",
        clientVersion: getHostedClientVersion(),
    };
}

function isAlreadySignedInError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as {
        message?: unknown;
        errors?: Array<{ message?: unknown }>;
    };

    const message =
        typeof candidate.message === "string"
            ? candidate.message.toLowerCase()
            : "";
    if (message.includes("already signed in")) {
        return true;
    }

    if (Array.isArray(candidate.errors)) {
        return candidate.errors.some(
            (item) =>
                typeof item?.message === "string" &&
                item.message.toLowerCase().includes("already signed in"),
        );
    }

    return false;
}

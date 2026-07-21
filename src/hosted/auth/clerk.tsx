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
import { useAuth, useSSO, useSignIn, useSignUp } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import { Platform } from "react-native";

import { getHostedClientVersion } from "@/src/buildInfo";
import { timedLog } from "@/src/common/utils";
import { HOSTED_SIGN_IN_METHOD_UNAVAILABLE_MESSAGE } from "@/src/hosted/auth/messages";
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
type HostedClerkSignOut = ReturnType<typeof useAuth>["signOut"];
type HostedClerkSetActive = NonNullable<
    ReturnType<typeof useSignIn>["setActive"]
>;
type HostedClerkSignIn = NonNullable<ReturnType<typeof useSignIn>["signIn"]>;
type HostedClerkSignUp = NonNullable<ReturnType<typeof useSignUp>["signUp"]>;

interface HostedClerkSsoFlowResult {
    createdSessionId: string | null;
    setActive?: HostedClerkSetActive;
    authSessionResult: WebBrowser.WebBrowserAuthSessionResult | null;
    signIn?: HostedClerkSignIn;
    signUp?: HostedClerkSignUp;
}

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
    const {
        isLoaded: signUpLoaded,
        setActive: setSignUpActive,
        signUp,
    } = useSignUp();
    const {
        isLoaded: signInLoaded,
        setActive: setSignInActive,
        signIn,
    } = useSignIn();
    const emailCodeModeRef = React.useRef<"sign-up" | "sign-in">("sign-up");

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

                    if (!signInLoaded || !signUpLoaded) {
                        throw new HostedAuthServiceError({
                            code: "unavailable",
                            message: "Clerk sign-in is not loaded",
                            userMessage:
                                "Sign-in is still loading. Please try again.",
                        });
                    }

                    const popup =
                        Platform.OS === "web" ? openHostedClerkPopup() : null;
                    if (Platform.OS === "web" && !popup) {
                        throw new HostedAuthServiceError({
                            code: "unavailable",
                            message: "OAuth popup was blocked",
                            userMessage:
                                "Sign-in popup was blocked. Allow pop-ups and try again.",
                        });
                    }

                    if (Platform.OS === "web") {
                        // On web, clerk-js signOut() navigates the top-level
                        // window to the after-sign-out URL, reloading the app
                        // and killing the in-flight OAuth flow. Instead of
                        // signing a lingering Clerk session out, reuse it the
                        // same way restoreSignIn does.
                        const existingToken =
                            await tryGetHostedClerkBrokerToken(getToken);
                        if (existingToken) {
                            popup?.close();
                            timedLog(
                                "Hosted Clerk SSO reused existing Clerk session on web",
                            );
                            return createHostedAuthSignInResult(
                                provider,
                                existingToken,
                            );
                        }
                    } else {
                        await signOutIfSessionExists(getToken, signOut);
                    }

                    const ssoResult =
                        Platform.OS === "web"
                            ? await startHostedClerkSsoFlowWithRetryOnSignedInError(
                                  {
                                      signIn,
                                      signUp,
                                      setActive: setSignInActive,
                                      strategy,
                                      redirectUrl,
                                      signOut,
                                      popup,
                                  },
                              )
                            : await startExpoSsoFlowWithRetryOnSignedInError({
                                  startSSOFlow,
                                  strategy,
                                  redirectUrl,
                                  signOut,
                              });
                    const { createdSessionId, setActive, authSessionResult } =
                        ssoResult;

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
                        const sessionToken =
                            await tryGetHostedClerkBrokerToken(getToken);
                        if (sessionToken) {
                            timedLog(
                                "Hosted Clerk SSO recovered broker token without created session id",
                            );
                            return createHostedAuthSignInResult(
                                provider,
                                sessionToken,
                            );
                        }

                        throw new HostedAuthServiceError({
                            code: "invalid_response",
                            message: `Clerk sign-in did not return an active session id (${formatSsoResultForLog(ssoResult)})`,
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
            startEmailCodeSignIn: async (email: string): Promise<void> => {
                try {
                    if (!signUpLoaded || !signUp) {
                        throw new HostedAuthServiceError({
                            code: "unavailable",
                            message: "Clerk sign-up is not loaded",
                            userMessage:
                                HOSTED_SIGN_IN_METHOD_UNAVAILABLE_MESSAGE,
                        });
                    }

                    await signOutIfSessionExists(getToken, signOut);
                    try {
                        // The Clerk instance requires a password at sign-up
                        // even when the account is created via email-code
                        // verification; without one the sign-up stalls at
                        // status=missing_requirements after the OTP step.
                        // These are disposable E2E test accounts that are
                        // never signed into with a password, so a random
                        // throwaway value satisfies the requirement.
                        await signUp.create({
                            emailAddress: email,
                            password: generateEmailCodeSignUpPassword(),
                        });
                        await signUp.prepareEmailAddressVerification({
                            strategy: "email_code",
                        });
                        emailCodeModeRef.current = "sign-up";
                    } catch (error) {
                        if (
                            !isIdentifierExistsError(error) ||
                            !signInLoaded ||
                            !signIn
                        ) {
                            throw error;
                        }

                        const signInAttempt = await signIn.create({
                            identifier: email,
                        });
                        const emailAddressId = findEmailCodeFactorId(
                            signInAttempt.supportedFirstFactors,
                        );
                        if (!emailAddressId) {
                            throw new HostedAuthServiceError({
                                code: "invalid_response",
                                message:
                                    "Clerk email-code sign-in did not expose an email_code first factor",
                                userMessage:
                                    HOSTED_SIGN_IN_METHOD_UNAVAILABLE_MESSAGE,
                            });
                        }
                        await signIn.prepareFirstFactor({
                            strategy: "email_code",
                            emailAddressId,
                        });
                        emailCodeModeRef.current = "sign-in";
                    }
                } catch (error) {
                    const hostedError = toHostedAuthServiceError(error);
                    timedLog(
                        `Hosted Clerk email-code start failed: ${formatErrorForLog(error)} (normalized: ${hostedError.message})`,
                    );
                    throw hostedError;
                }
            },
            completeEmailCodeSignIn: async (
                code: string,
            ): Promise<HostedAuthSignInResult> => {
                try {
                    const mode = emailCodeModeRef.current;
                    if (mode === "sign-up") {
                        if (!signUpLoaded || !signUp || !setSignUpActive) {
                            throw new HostedAuthServiceError({
                                code: "unavailable",
                                message: "Clerk sign-up is not loaded",
                                userMessage:
                                    HOSTED_SIGN_IN_METHOD_UNAVAILABLE_MESSAGE,
                            });
                        }

                        const result =
                            await signUp.attemptEmailAddressVerification({
                                code,
                            });
                        if (
                            result.status !== "complete" ||
                            !result.createdSessionId
                        ) {
                            throw new HostedAuthServiceError({
                                code: "invalid_response",
                                message: `Clerk email-code sign-up did not complete (status=${result.status}, missing=${formatSignUpMissingFields(result)})`,
                                userMessage:
                                    "Sign-in did not complete. Please try again.",
                            });
                        }

                        await setSignUpActive({
                            session: result.createdSessionId,
                        });
                    } else {
                        if (!signInLoaded || !signIn || !setSignInActive) {
                            throw new HostedAuthServiceError({
                                code: "unavailable",
                                message: "Clerk sign-in is not loaded",
                                userMessage:
                                    HOSTED_SIGN_IN_METHOD_UNAVAILABLE_MESSAGE,
                            });
                        }

                        const result = await signIn.attemptFirstFactor({
                            strategy: "email_code",
                            code,
                        });
                        if (
                            result.status !== "complete" ||
                            !result.createdSessionId
                        ) {
                            throw new HostedAuthServiceError({
                                code: "invalid_response",
                                message: `Clerk email-code sign-in did not complete (status=${result.status})`,
                                userMessage:
                                    "Sign-in did not complete. Please try again.",
                            });
                        }

                        await setSignInActive({
                            session: result.createdSessionId,
                        });
                    }

                    const sessionToken =
                        await getHostedClerkBrokerToken(getToken);
                    if (!sessionToken) {
                        throw new HostedAuthServiceError({
                            code: "invalid_response",
                            message:
                                "Clerk did not provide an HCB broker token after email-code sign-in",
                            userMessage:
                                "Sign-in completed, but we could not verify your broker session.",
                        });
                    }

                    return createHostedAuthSignInResult("google", sessionToken);
                } catch (error) {
                    const hostedError = toHostedAuthServiceError(error);
                    timedLog(
                        `Hosted Clerk email-code complete failed: ${formatErrorForLog(error)} (normalized: ${hostedError.message})`,
                    );
                    throw hostedError;
                }
            },
            signOut: async (): Promise<void> => {
                if (!signOut) {
                    return;
                }
                await signOut();
            },
        }),
        [
            getToken,
            setSignInActive,
            setSignUpActive,
            signIn,
            signInLoaded,
            signOut,
            signUp,
            signUpLoaded,
            startSSOFlow,
        ],
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

function openHostedClerkPopup(): Window | null {
    if (typeof window === "undefined") {
        return null;
    }

    const width = 500;
    const height = 650;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
    return window.open(
        "about:blank",
        "ConduitHostedOAuth",
        [
            `width=${width}`,
            `height=${height}`,
            `left=${Math.round(left)}`,
            `top=${Math.round(top)}`,
            "toolbar=no",
            "menubar=no",
            "status=no",
            "scrollbars=yes",
            "resizable=yes",
        ].join(","),
    );
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

function formatSsoResultForLog(result: HostedClerkSsoFlowResult): string {
    const signInStatus = readObjectString(result.signIn, "status");
    const signUpStatus = readObjectString(result.signUp, "status");
    const firstFactorStatus = readObjectString(
        readObjectValue(result.signIn, "firstFactorVerification"),
        "status",
    );
    return [
        `authSessionType=${result.authSessionResult?.type ?? "none"}`,
        `signInStatus=${signInStatus ?? "none"}`,
        `signUpStatus=${signUpStatus ?? "none"}`,
        `firstFactorStatus=${firstFactorStatus ?? "none"}`,
    ].join(", ");
}

function readObjectValue(value: unknown, key: string): unknown {
    if (!value || typeof value !== "object") {
        return undefined;
    }

    return (value as Record<string, unknown>)[key];
}

function readObjectString(value: unknown, key: string): string | undefined {
    const next = readObjectValue(value, key);
    return typeof next === "string" ? next : undefined;
}

function generateEmailCodeSignUpPassword(): string {
    // Throwaway credential for disposable E2E test accounts; never used to
    // sign in again, so cryptographic strength is not required. Long random
    // value keeps Clerk's password validation (length/breach checks) happy.
    const alphabet =
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let value = "";
    for (let index = 0; index < 24; index++) {
        value += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return `E2e!${value}`;
}

function formatSignUpMissingFields(result: unknown): string {
    const missingFields = readObjectValue(result, "missingFields");
    if (!Array.isArray(missingFields) || missingFields.length === 0) {
        return "none";
    }
    return missingFields.map((field) => String(field)).join("|");
}

function findEmailCodeFactorId(factors: unknown): string | null {
    if (!Array.isArray(factors)) {
        return null;
    }

    for (const factor of factors) {
        if (readObjectString(factor, "strategy") !== "email_code") {
            continue;
        }
        const emailAddressId = readObjectString(factor, "emailAddressId");
        if (emailAddressId) {
            return emailAddressId;
        }
    }

    return null;
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
    signOut?: HostedClerkSignOut,
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

    await signOutWithoutWebNavigation(signOut);
}

async function signOutWithoutWebNavigation(
    signOut: HostedClerkSignOut,
): Promise<void> {
    if (Platform.OS === "web") {
        // clerk-js signOut() navigates the top-level window to the
        // after-sign-out URL on web, which reloads the app mid-flow. Passing
        // a callback suppresses that navigation while still clearing the
        // Clerk session.
        await signOut(noopSignOutCallback);
        return;
    }

    await signOut();
}

function noopSignOutCallback(): void {}

async function startExpoSsoFlowWithRetryOnSignedInError(input: {
    startSSOFlow: ReturnType<typeof useSSO>["startSSOFlow"];
    strategy: HostedClerkOAuthStrategy;
    redirectUrl: string;
    signOut?: () => Promise<unknown>;
}): Promise<HostedClerkSsoFlowResult> {
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

async function startHostedClerkSsoFlowWithRetryOnSignedInError(input: {
    signIn: HostedClerkSignIn | undefined;
    signUp: HostedClerkSignUp | undefined;
    setActive: HostedClerkSetActive | undefined;
    strategy: HostedClerkOAuthStrategy;
    redirectUrl: string;
    signOut?: HostedClerkSignOut;
    popup?: Window | null;
}): Promise<HostedClerkSsoFlowResult> {
    if (!input.signIn || !input.signUp || !input.setActive) {
        throw new HostedAuthServiceError({
            code: "unavailable",
            message: "Clerk sign-in is not loaded",
            userMessage: "Sign-in is still loading. Please try again.",
        });
    }
    const flowInput = {
        signIn: input.signIn,
        signUp: input.signUp,
        setActive: input.setActive,
        strategy: input.strategy,
        redirectUrl: input.redirectUrl,
    };

    return runWithReservedPopup(input.popup, async () => {
        try {
            return await startHostedClerkSsoFlow(flowInput);
        } catch (error) {
            if (!isAlreadySignedInError(error) || !input.signOut) {
                throw error;
            }

            await signOutWithoutWebNavigation(input.signOut);
            return startHostedClerkSsoFlow(flowInput);
        }
    });
}

async function startHostedClerkSsoFlow(input: {
    signIn: HostedClerkSignIn;
    signUp: HostedClerkSignUp;
    setActive: HostedClerkSetActive;
    strategy: HostedClerkOAuthStrategy;
    redirectUrl: string;
}): Promise<HostedClerkSsoFlowResult> {
    const signInAttempt = await input.signIn.create({
        strategy: input.strategy,
        redirectUrl: input.redirectUrl,
    });
    const externalVerificationRedirectURL =
        signInAttempt.firstFactorVerification.externalVerificationRedirectURL;
    if (!externalVerificationRedirectURL) {
        throw new HostedAuthServiceError({
            code: "invalid_response",
            message:
                "Clerk did not return an external verification redirect URL",
            userMessage: "Sign-in did not start. Please try again.",
        });
    }

    const authSessionResult = await WebBrowser.openAuthSessionAsync(
        externalVerificationRedirectURL.toString(),
        input.redirectUrl,
    );
    if (authSessionResult.type !== "success" || !authSessionResult.url) {
        return {
            createdSessionId: null,
            setActive: input.setActive,
            signIn: signInAttempt,
            signUp: input.signUp,
            authSessionResult,
        };
    }

    const rotatingTokenNonce =
        new URL(authSessionResult.url).searchParams.get(
            "rotating_token_nonce",
        ) ?? "";
    const reloadedSignIn = await signInAttempt.reload({ rotatingTokenNonce });
    let completedSignUp = input.signUp;
    if (reloadedSignIn.firstFactorVerification.status === "transferable") {
        completedSignUp = await input.signUp.create({ transfer: true });
    }

    return {
        createdSessionId:
            completedSignUp.createdSessionId ??
            reloadedSignIn.createdSessionId ??
            null,
        setActive: input.setActive,
        signIn: reloadedSignIn,
        signUp: completedSignUp,
        authSessionResult,
    };
}

async function runWithReservedPopup<T>(
    popup: Window | null | undefined,
    operation: () => Promise<T>,
): Promise<T> {
    if (Platform.OS !== "web" || !popup || typeof window === "undefined") {
        return operation();
    }

    const originalOpen = window.open;
    let consumed = false;
    window.open = ((url?: string | URL, target?: string, features?: string) => {
        if (!consumed && !popup.closed) {
            consumed = true;
            if (url) {
                popup.location.href = String(url);
            }
            popup.focus?.();
            return popup;
        }

        return originalOpen.call(window, url, target, features);
    }) as typeof window.open;

    try {
        return await operation();
    } finally {
        window.open = originalOpen;
        if (!consumed && !popup.closed) {
            popup.close();
        }
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
        platform:
            Platform.OS === "ios"
                ? "ios"
                : Platform.OS === "android"
                  ? "android"
                  : "web",
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

function isIdentifierExistsError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as {
        code?: unknown;
        message?: unknown;
        errors?: Array<{ code?: unknown; message?: unknown }>;
    };

    const message =
        typeof candidate.message === "string"
            ? candidate.message.toLowerCase()
            : "";
    if (message.includes("already") || message.includes("exists")) {
        return true;
    }
    if (
        typeof candidate.code === "string" &&
        candidate.code.toLowerCase().includes("identifier")
    ) {
        return true;
    }

    if (Array.isArray(candidate.errors)) {
        return candidate.errors.some((item) => {
            const itemCode =
                typeof item?.code === "string" ? item.code.toLowerCase() : "";
            const itemMessage =
                typeof item?.message === "string"
                    ? item.message.toLowerCase()
                    : "";
            return (
                itemCode.includes("identifier") ||
                itemMessage.includes("already") ||
                itemMessage.includes("exists")
            );
        });
    }

    return false;
}

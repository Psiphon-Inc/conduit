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
import * as WebBrowser from "expo-web-browser";
import React from "react";
import { Platform } from "react-native";
import { act, create } from "react-test-renderer";

import {
    readHostedClerkJwtTemplate,
    readHostedClerkPublishableKey,
    useHostedClerkAuthService,
} from "@/src/hosted/auth/clerk";
import { HostedAuthService } from "@/src/hosted/auth/types";

jest.mock("expo-auth-session", () => ({
    makeRedirectUri: jest.fn(({ path } = {}) => `conduit://${path ?? ""}`),
}));

jest.mock("expo-constants", () => ({
    expoConfig: {
        scheme: "conduit",
        version: "1.0.0",
    },
}));

const mockStartSSOFlow = jest.fn();
const mockGetToken = jest.fn();
const mockSignOut = jest.fn();
const mockSignUpCreate = jest.fn();
const mockPrepareEmailAddressVerification = jest.fn();
const mockAttemptEmailAddressVerification = jest.fn();
const mockSignInCreate = jest.fn();
const mockPrepareFirstFactor = jest.fn();
const mockAttemptFirstFactor = jest.fn();
const mockSignUpSetActive = jest.fn();
const mockSignInSetActive = jest.fn();
let mockSignUpLoaded = true;
let mockSignInLoaded = true;
let mockOpenAuthSessionAsync: jest.SpyInstance;

jest.mock("@clerk/clerk-expo", () => {
    const React = require("react");

    return {
        ClerkProvider: ({ children }: { children: React.ReactNode }) =>
            React.createElement(React.Fragment, null, children),
        useSSO: () => ({
            startSSOFlow: mockStartSSOFlow,
        }),
        useAuth: () => ({
            getToken: mockGetToken,
            signOut: mockSignOut,
        }),
        useSignUp: () => ({
            isLoaded: mockSignUpLoaded,
            setActive: mockSignUpSetActive,
            signUp: {
                create: mockSignUpCreate,
                prepareEmailAddressVerification:
                    mockPrepareEmailAddressVerification,
                attemptEmailAddressVerification:
                    mockAttemptEmailAddressVerification,
            },
        }),
        useSignIn: () => ({
            isLoaded: mockSignInLoaded,
            setActive: mockSignInSetActive,
            signIn: {
                create: mockSignInCreate,
                prepareFirstFactor: mockPrepareFirstFactor,
                attemptFirstFactor: mockAttemptFirstFactor,
            },
        }),
    };
});

describe("hosted clerk auth", () => {
    let restorePlatformOS: (() => void) | null = null;

    beforeEach(() => {
        mockStartSSOFlow.mockReset();
        mockOpenAuthSessionAsync = jest
            .spyOn(WebBrowser, "openAuthSessionAsync")
            .mockResolvedValue({
                type: "success",
                url: "conduit://sso-callback?rotating_token_nonce=nonce_test",
            });
        mockGetToken.mockReset();
        mockSignOut.mockReset();
        mockSignUpCreate.mockReset();
        mockPrepareEmailAddressVerification.mockReset();
        mockAttemptEmailAddressVerification.mockReset();
        mockSignInCreate.mockReset();
        mockPrepareFirstFactor.mockReset();
        mockAttemptFirstFactor.mockReset();
        mockSignUpSetActive.mockReset();
        mockSignInSetActive.mockReset();
        mockSignUpLoaded = true;
        mockSignInLoaded = true;
        mockGetToken.mockResolvedValue("clerk.jwt.token");
        mockStartSSOFlow.mockResolvedValue({
            createdSessionId: "sess_test",
            setActive: jest.fn(async () => {}),
            authSessionResult: { type: "success" },
        });
        mockSignInCreate.mockImplementation(async (input) => {
            if (input?.strategy) {
                return makeOAuthSignInAttempt();
            }

            return {
                supportedFirstFactors: [
                    {
                        strategy: "email_code",
                        emailAddressId: "email_address_test",
                    },
                ],
            };
        });
        mockAttemptEmailAddressVerification.mockResolvedValue({
            status: "complete",
            createdSessionId: "sess_email",
        });
        mockAttemptFirstFactor.mockResolvedValue({
            status: "complete",
            createdSessionId: "sess_existing_email",
        });
    });

    afterEach(() => {
        restorePlatformOS?.();
        restorePlatformOS = null;
        jest.restoreAllMocks();
    });

    it("reads publishable key from env", () => {
        process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = " pk_test_123 ";
        expect(readHostedClerkPublishableKey()).toBe("pk_test_123");
        delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
        expect(readHostedClerkPublishableKey()).toBe("");

        process.env.EXPO_PUBLIC_CLERK_HCB_JWT_TEMPLATE = " hcb_prod ";
        expect(readHostedClerkJwtTemplate()).toBe("hcb_prod");
        delete process.env.EXPO_PUBLIC_CLERK_HCB_JWT_TEMPLATE;
        expect(readHostedClerkJwtTemplate()).toBe("hcb");
    });

    it("mints broker token through interactive clerk sso flow", async () => {
        let service: HostedAuthService | null = null;

        function Consumer() {
            service = useHostedClerkAuthService();
            return null;
        }

        await act(async () => {
            create(<Consumer />);
        });

        function getService(): HostedAuthService {
            if (!service) {
                throw new Error("service unavailable");
            }
            return service;
        }

        await expect(getService().signIn("google")).resolves.toEqual(
            expect.objectContaining({
                provider: "google",
                tokenType: "clerk_broker_jwt",
                brokerToken: "clerk.jwt.token",
                platform: expect.stringMatching(/ios|android/),
                clientVersion: expect.stringMatching(/^conduit-/),
            }),
        );

        expect(mockStartSSOFlow).toHaveBeenCalledTimes(1);
        expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it("reserves a web popup before completing the expo sso flow", async () => {
        restorePlatformOS = mockPlatformOS("web");
        const popup = {
            close: jest.fn(),
            closed: false,
            focus: jest.fn(),
            location: { href: "about:blank" },
        } as unknown as Window;
        const openSpy = mockWindowOpen(popup);
        // No reusable Clerk session before the flow starts.
        mockGetToken.mockResolvedValueOnce(null);
        mockOpenAuthSessionAsync.mockImplementationOnce(async () => {
            const opened = window.open("https://clerk.example/sso", "_blank");
            expect(opened).toBe(popup);
            return { type: "success", url: "conduit://sso-callback" };
        });
        let service: HostedAuthService | null = null;

        function Consumer() {
            service = useHostedClerkAuthService();
            return null;
        }

        await act(async () => {
            create(<Consumer />);
        });

        function getService(): HostedAuthService {
            if (!service) {
                throw new Error("service unavailable");
            }
            return service;
        }

        await expect(getService().signIn("google")).resolves.toEqual(
            expect.objectContaining({
                provider: "google",
                brokerToken: "clerk.jwt.token",
                platform: "web",
            }),
        );

        expect(openSpy).toHaveBeenCalledWith(
            "about:blank",
            "ConduitHostedOAuth",
            expect.stringContaining("width=500"),
        );
        expect(popup.location.href).toBe("https://clerk.example/sso");
        expect(mockSignInCreate).toHaveBeenCalledWith({
            strategy: "oauth_google",
            redirectUrl: "conduit://sso-callback",
        });
        expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
            "https://clerk.example/sso",
            "conduit://sso-callback",
        );
        expect(mockSignInSetActive).toHaveBeenCalledWith({
            session: "sess_test",
        });
        expect(mockStartSSOFlow).not.toHaveBeenCalled();
        expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("reuses an existing clerk session on web instead of signing out", async () => {
        restorePlatformOS = mockPlatformOS("web");
        const popup = {
            close: jest.fn(),
            closed: false,
            focus: jest.fn(),
            location: { href: "about:blank" },
        } as unknown as Window;
        mockWindowOpen(popup);
        let service: HostedAuthService | null = null;

        function Consumer() {
            service = useHostedClerkAuthService();
            return null;
        }

        await act(async () => {
            create(<Consumer />);
        });

        function getService(): HostedAuthService {
            if (!service) {
                throw new Error("service unavailable");
            }
            return service;
        }

        await expect(getService().signIn("google")).resolves.toEqual(
            expect.objectContaining({
                provider: "google",
                brokerToken: "clerk.jwt.token",
                platform: "web",
            }),
        );

        expect(popup.close).toHaveBeenCalledTimes(1);
        expect(mockSignOut).not.toHaveBeenCalled();
        expect(mockSignInCreate).not.toHaveBeenCalled();
        expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
    });

    it("retries with a non-navigating sign-out when clerk reports already signed in on web", async () => {
        restorePlatformOS = mockPlatformOS("web");
        const popup = {
            close: jest.fn(),
            closed: false,
            focus: jest.fn(),
            location: { href: "about:blank" },
        } as unknown as Window;
        mockWindowOpen(popup);
        mockGetToken.mockResolvedValueOnce(null);
        mockSignInCreate.mockRejectedValueOnce({
            errors: [{ message: "You are already signed in." }],
        });
        let service: HostedAuthService | null = null;

        function Consumer() {
            service = useHostedClerkAuthService();
            return null;
        }

        await act(async () => {
            create(<Consumer />);
        });

        function getService(): HostedAuthService {
            if (!service) {
                throw new Error("service unavailable");
            }
            return service;
        }

        await expect(getService().signIn("google")).resolves.toEqual(
            expect.objectContaining({
                provider: "google",
                brokerToken: "clerk.jwt.token",
                platform: "web",
            }),
        );

        expect(mockSignOut).toHaveBeenCalledTimes(1);
        // The web sign-out must receive a callback so clerk-js does not
        // navigate the top-level window mid-flow.
        expect(typeof mockSignOut.mock.calls[0][0]).toBe("function");
        expect(mockSignInCreate).toHaveBeenCalledTimes(2);
    });

    it("reports a blocked web sso popup as unavailable", async () => {
        restorePlatformOS = mockPlatformOS("web");
        mockWindowOpen(null);
        let service: HostedAuthService | null = null;

        function Consumer() {
            service = useHostedClerkAuthService();
            return null;
        }

        await act(async () => {
            create(<Consumer />);
        });

        function getService(): HostedAuthService {
            if (!service) {
                throw new Error("service unavailable");
            }
            return service;
        }

        await expect(getService().signIn("google")).rejects.toEqual(
            expect.objectContaining({
                code: "unavailable",
                userMessage:
                    "Sign-in popup was blocked. Allow pop-ups and try again.",
            }),
        );
        expect(mockSignInCreate).not.toHaveBeenCalled();
        expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
        expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("does not open the web popup before clerk sign-in is loaded", async () => {
        restorePlatformOS = mockPlatformOS("web");
        mockSignInLoaded = false;
        const openSpy = mockWindowOpen(null);
        let service: HostedAuthService | null = null;

        function Consumer() {
            service = useHostedClerkAuthService();
            return null;
        }

        await act(async () => {
            create(<Consumer />);
        });

        function getService(): HostedAuthService {
            if (!service) {
                throw new Error("service unavailable");
            }
            return service;
        }

        await expect(getService().signIn("google")).rejects.toEqual(
            expect.objectContaining({
                code: "unavailable",
                userMessage: "Sign-in is still loading. Please try again.",
            }),
        );
        expect(openSpy).not.toHaveBeenCalled();
        expect(mockSignInCreate).not.toHaveBeenCalled();
        expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
        expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("restores a broker token from the existing clerk session", async () => {
        let service: HostedAuthService | null = null;

        function Consumer() {
            service = useHostedClerkAuthService();
            return null;
        }

        await act(async () => {
            create(<Consumer />);
        });

        function getService(): HostedAuthService {
            if (!service) {
                throw new Error("service unavailable");
            }
            return service;
        }

        await expect(getService().restoreSignIn("google")).resolves.toEqual(
            expect.objectContaining({
                provider: "google",
                brokerToken: "clerk.jwt.token",
            }),
        );
        expect(mockStartSSOFlow).not.toHaveBeenCalled();
    });

    it("signs out of clerk when requested", async () => {
        let service: HostedAuthService | null = null;

        function Consumer() {
            service = useHostedClerkAuthService();
            return null;
        }

        await act(async () => {
            create(<Consumer />);
        });

        function getService(): HostedAuthService {
            if (!service) {
                throw new Error("service unavailable");
            }
            return service;
        }

        await expect(getService().signOut()).resolves.toBeUndefined();
        expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it("mints broker token through email-code sign-up", async () => {
        let service: HostedAuthService | null = null;

        function Consumer() {
            service = useHostedClerkAuthService();
            return null;
        }

        await act(async () => {
            create(<Consumer />);
        });

        function getService(): HostedAuthService {
            if (!service) {
                throw new Error("service unavailable");
            }
            return service;
        }

        await expect(
            getService().startEmailCodeSignIn?.("qa123+clerk_test@example.com"),
        ).resolves.toBeUndefined();
        await expect(
            getService().completeEmailCodeSignIn?.("424242"),
        ).resolves.toEqual(
            expect.objectContaining({
                provider: "google",
                tokenType: "clerk_broker_jwt",
                brokerToken: "clerk.jwt.token",
            }),
        );

        // The Clerk instance requires a password at sign-up; without one the
        // sign-up stalls at status=missing_requirements after verification.
        expect(mockSignUpCreate).toHaveBeenCalledWith({
            emailAddress: "qa123+clerk_test@example.com",
            password: expect.stringMatching(/^E2e!.{24}$/),
        });
        expect(mockPrepareEmailAddressVerification).toHaveBeenCalledWith({
            strategy: "email_code",
        });
        expect(mockAttemptEmailAddressVerification).toHaveBeenCalledWith({
            code: "424242",
        });
        expect(mockSignUpSetActive).toHaveBeenCalledWith({
            session: "sess_email",
        });
        expect(mockSignInCreate).not.toHaveBeenCalled();
    });

    it("falls back to email-code sign-in for an existing test email", async () => {
        mockSignUpCreate.mockRejectedValueOnce({
            errors: [
                {
                    code: "form_identifier_exists",
                    message: "That email address is already in use.",
                },
            ],
        });
        let service: HostedAuthService | null = null;

        function Consumer() {
            service = useHostedClerkAuthService();
            return null;
        }

        await act(async () => {
            create(<Consumer />);
        });

        function getService(): HostedAuthService {
            if (!service) {
                throw new Error("service unavailable");
            }
            return service;
        }

        await expect(
            getService().startEmailCodeSignIn?.("qa+clerk_test@example.com"),
        ).resolves.toBeUndefined();
        await expect(
            getService().completeEmailCodeSignIn?.("424242"),
        ).resolves.toEqual(
            expect.objectContaining({
                provider: "google",
                tokenType: "clerk_broker_jwt",
                brokerToken: "clerk.jwt.token",
            }),
        );

        expect(mockSignInCreate).toHaveBeenCalledWith({
            identifier: "qa+clerk_test@example.com",
        });
        expect(mockPrepareFirstFactor).toHaveBeenCalledWith({
            strategy: "email_code",
            emailAddressId: "email_address_test",
        });
        expect(mockAttemptFirstFactor).toHaveBeenCalledWith({
            strategy: "email_code",
            code: "424242",
        });
        expect(mockSignInSetActive).toHaveBeenCalledWith({
            session: "sess_existing_email",
        });
    });
});

function makeOAuthSignInAttempt() {
    const reloaded = {
        createdSessionId: "sess_test",
        firstFactorVerification: {
            status: "verified",
            externalVerificationRedirectURL: new URL(
                "https://clerk.example/sso",
            ),
        },
    };

    return {
        createdSessionId: null,
        firstFactorVerification: {
            status: "unverified",
            externalVerificationRedirectURL: new URL(
                "https://clerk.example/sso",
            ),
        },
        reload: jest.fn(async () => reloaded),
    };
}

function mockPlatformOS(os: typeof Platform.OS): () => void {
    const previousOS = Platform.OS;
    Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: os,
    });

    return () => {
        Object.defineProperty(Platform, "OS", {
            configurable: true,
            value: previousOS,
        });
    };
}

function mockWindowOpen(popup: Window | null): jest.Mock {
    const open = jest.fn(() => popup);
    Object.defineProperty(window, "open", {
        configurable: true,
        writable: true,
        value: open,
    });
    return open;
}

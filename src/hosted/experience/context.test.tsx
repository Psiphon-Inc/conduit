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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import React from "react";
import { Platform } from "react-native";
import type { CustomerInfo } from "react-native-purchases";
import { ReactTestRenderer, act, create } from "react-test-renderer";

import {
    QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID,
    SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
    SECURESTORE_CONDUIT_NAME_KEY,
    SECURESTORE_HOSTED_LAST_AUTH_PROVIDER_KEY,
} from "@/src/constants";
import { HostedAuthService } from "@/src/hosted/auth/types";
import {
    HostedAccountProfileConflictError,
    HostedPersonalCompartmentIdConflictError,
    createHostedClient,
} from "@/src/hosted/client";
import {
    HostedExperienceContextValue,
    HostedExperienceProvider,
    useHostedExperienceContext,
} from "@/src/hosted/experience/context";
import { RevenueCatContextValue } from "@/src/hosted/revenuecatContext";
import {
    HostedSession,
    createHostedSessionClient,
} from "@/src/hosted/sessionClient";

describe("hosted experience context", () => {
    const originalPlatformOs = Platform.OS;

    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-expect-error test-only mock helper
        SecureStore.__resetStore();
        Object.defineProperty(Platform, "OS", {
            configurable: true,
            value: "android",
        });
    });

    afterEach(() => {
        mountedRenderers.splice(0).forEach((renderer) => {
            act(() => {
                renderer.unmount();
            });
        });
        mountedQueryClients.splice(0).forEach((queryClient) => {
            queryClient.clear();
        });
    });

    afterAll(() => {
        Object.defineProperty(Platform, "OS", {
            configurable: true,
            value: originalPlatformOs,
        });
    });

    it("orchestrates auth, session, revenuecat, and conduits poll", async () => {
        await SecureStore.setItemAsync(
            SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
            "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g",
        );

        const now = jest.fn().mockReturnValue(10_000);
        const session = makeSession({
            accessToken: "access.login",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
        });

        const authService = makeAuthService({
            signIn: jest.fn().mockResolvedValue({
                provider: "google",
                tokenType: "clerk_broker_jwt",
                brokerToken: "clerk.broker.jwt",
                platform: "android",
                clientVersion: "2.0.0",
            }),
        });

        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(null),
            login: jest.fn().mockResolvedValue(session),
        });
        const hostedClient = makeHostedClient({
            getConduitsSnapshot: jest.fn().mockResolvedValue({
                entitlement: {
                    status: "active",
                    product_id: "test.product.primary",
                },
                conduits: [
                    {
                        conduit_id: "cond_1",
                        proxy_id: "st_1",
                        status: "active",
                    },
                ],
            }),
        });

        const revenueCat = makeRevenueCatContext({
            initialize: jest
                .fn()
                .mockResolvedValue(makeCustomerInfo("acc_123")),
            refreshCustomerInfo: jest
                .fn()
                .mockResolvedValue(makeCustomerInfo("acc_123")),
        });

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        function getContextValue(): HostedExperienceContextValue {
            if (!contextValue) {
                throw new Error("context unavailable");
            }
            return contextValue;
        }

        let renderer: ReactTestRenderer;
        await act(async () => {
            renderer = renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now,
                    authService,
                    sessionClient,
                    hostedClient,
                    revenueCat,
                    revenueCatPublicKeys: {
                        ios: "appl_public",
                        android: "goog_public",
                    },
                },
                <Consumer />,
            );
        });

        await act(async () => {
            await getContextValue().signIn("google");
        });

        expect(authService.signIn).toHaveBeenCalledWith("google");
        expect(sessionClient.login).toHaveBeenCalledWith({
            token_type: "clerk_broker_jwt",
            broker_token: "clerk.broker.jwt",
            platform: "android",
            client_version: "2.0.0",
        });
        expect(revenueCat.initialize).toHaveBeenCalledWith({
            publicKeys: { ios: "appl_public", android: "goog_public" },
            accountId: session.accountId,
        });
        expect(hostedClient.setPersonalCompartmentId).toHaveBeenCalledWith(
            "access.login",
            "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g",
        );
        expect(
            mountedQueryClients[mountedQueryClients.length - 1]?.getQueryData([
                QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID,
            ]),
        ).toBe("jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g");
        expect(hostedClient.getConduitsSnapshot).toHaveBeenCalledWith(
            "access.login",
        );
        const setIdCallOrder = (
            hostedClient.setPersonalCompartmentId as jest.Mock
        ).mock.invocationCallOrder[0];
        const getConduitsCallOrder = (
            hostedClient.getConduitsSnapshot as jest.Mock
        ).mock.invocationCallOrder[0];
        expect(setIdCallOrder).toBeLessThan(getConduitsCallOrder);
        expect(getContextValue().state.authPhase).toBe("authenticated");
        expect(getContextValue().state.revenuecatPhase).toBe("ready");
        expect(getContextValue().state.stationPhase).toBe("active");
        expect(getContextValue().state.entitlementSnapshot).toBe("active");

        act(() => {
            renderer!.unmount();
        });
    });

    it("reconciles personal compartment id conflicts during Android login", async () => {
        await SecureStore.setItemAsync(
            SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
            "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g",
        );

        const session = makeSession({
            accessToken: "access.login",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
        });
        const authService = makeAuthService({
            signIn: jest.fn().mockResolvedValue({
                provider: "google",
                tokenType: "clerk_broker_jwt",
                brokerToken: "clerk.broker.jwt",
                platform: "android",
                clientVersion: "2.0.0",
            }),
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(null),
            login: jest.fn().mockResolvedValue(session),
        });
        const hostedClient = makeHostedClient({
            setPersonalCompartmentId: jest
                .fn()
                .mockRejectedValue(
                    new HostedPersonalCompartmentIdConflictError(
                        "N8nN1DTLcuNj3DG39uUyIqBP+xKujq6IAklKO1f1Ftk",
                    ),
                ),
            getConduitsSnapshot: jest.fn().mockResolvedValue({
                entitlement: {
                    status: "active",
                    product_id: "test.product.primary",
                },
                conduits: [
                    {
                        conduit_id: "cond_1",
                        proxy_id: "st_1",
                        status: "active",
                    },
                ],
            }),
        });

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now: () => 10_000,
                    authService,
                    sessionClient,
                    hostedClient,
                    revenueCat: makeRevenueCatContext(),
                },
                <Consumer />,
            );
        });

        await act(async () => {
            await contextValue!.signIn("google");
        });
        await waitFor(() => {
            expect(contextValue!.state.authPhase).toBe("authenticated");
        });
        await expect(
            SecureStore.getItemAsync(
                SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
            ),
        ).resolves.toBe("N8nN1DTLcuNj3DG39uUyIqBP+xKujq6IAklKO1f1Ftk");
        expect(
            mountedQueryClients[mountedQueryClients.length - 1]?.getQueryData([
                QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID,
            ]),
        ).toBe("N8nN1DTLcuNj3DG39uUyIqBP+xKujq6IAklKO1f1Ftk");
    });

    it("keeps auth alive when Android personal compartment sync fails", async () => {
        await SecureStore.setItemAsync(
            SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
            "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g",
        );

        const session = makeSession({
            accessToken: "access.login",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
        });
        const authService = makeAuthService({
            signIn: jest.fn().mockResolvedValue({
                provider: "google",
                tokenType: "clerk_broker_jwt",
                brokerToken: "clerk.broker.jwt",
                platform: "android",
                clientVersion: "2.0.0",
            }),
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(null),
            login: jest.fn().mockResolvedValue(session),
        });
        const hostedClient = makeHostedClient({
            setPersonalCompartmentId: jest
                .fn()
                .mockRejectedValue(new Error("temporary upstream failure")),
            getConduitsSnapshot: jest.fn().mockResolvedValue({
                entitlement: {
                    status: "active",
                    product_id: "test.product.primary",
                },
                conduits: [
                    {
                        conduit_id: "cond_1",
                        proxy_id: "st_1",
                        status: "active",
                    },
                ],
            }),
        });

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now: () => 10_000,
                    authService,
                    sessionClient,
                    hostedClient,
                    revenueCat: makeRevenueCatContext(),
                },
                <Consumer />,
            );
        });

        await act(async () => {
            await contextValue!.signIn("google");
        });

        await waitFor(() => {
            expect(contextValue!.state.authPhase).toBe("authenticated");
        });
        expect(contextValue!.state.session?.accessToken).toBe("access.login");
        expect(hostedClient.getConduitsSnapshot).toHaveBeenCalledWith(
            "access.login",
        );
        expect(
            mountedQueryClients[mountedQueryClients.length - 1]?.getQueryData([
                QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID,
            ]),
        ).toBe("jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g");
    });

    it("refreshes expiring sessions via session client", async () => {
        const now = jest.fn().mockReturnValue(20_000);
        const expiringSession = makeSession({
            accessToken: "access.old",
            accessTokenExpiresAtMs: 30_000,
            refreshTokenExpiresAtMs: 200_000,
        });
        const refreshedSession = {
            ...expiringSession,
            accessToken: "access.new",
            accessTokenExpiresAtMs: 200_000,
        };

        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(expiringSession),
            refresh: jest.fn().mockResolvedValue(refreshedSession),
        });

        const hostedClient = makeHostedClient();
        const revenueCat = makeRevenueCatContext();
        const authService = makeAuthService();

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        function getContextValue(): HostedExperienceContextValue {
            if (!contextValue) {
                throw new Error("context unavailable");
            }
            return contextValue;
        }

        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now,
                    authService,
                    sessionClient,
                    hostedClient,
                    revenueCat,
                },
                <Consumer />,
            );
        });

        await act(async () => {
            await getContextValue().refreshSessionIfNeeded();
        });
        await flushPromises();

        expect(sessionClient.refresh).toHaveBeenCalledTimes(1);
        expect(getContextValue().state.session?.accessToken).toBe("access.new");
    });

    it("restores hosted auth from the persisted provider hint", async () => {
        const session = makeSession({
            accessToken: "access.login",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
        });
        await SecureStore.setItemAsync(
            SECURESTORE_HOSTED_LAST_AUTH_PROVIDER_KEY,
            JSON.stringify({
                baseUrl: "https://hcb.example.test",
                provider: "google",
            }),
        );

        const authService = makeAuthService({
            restoreSignIn: jest.fn().mockResolvedValue({
                provider: "google",
                tokenType: "clerk_broker_jwt",
                brokerToken: "clerk.restored.jwt",
                platform: "android",
                clientVersion: "2.0.0",
            }),
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(null),
            login: jest.fn().mockResolvedValue(session),
        });
        const hostedClient = makeHostedClient({
            getConduitsSnapshot: jest.fn().mockResolvedValue({
                entitlement: {
                    status: "active",
                    product_id: "test.product.primary",
                },
                conduits: [
                    {
                        conduit_id: "cond_1",
                        proxy_id: "st_1",
                        status: "active",
                    },
                ],
            }),
        });

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now: () => 10_000,
                    authService,
                    sessionClient,
                    hostedClient,
                    revenueCat: makeRevenueCatContext(),
                },
                <Consumer />,
            );
        });

        await waitFor(() => {
            expect(authService.restoreSignIn).toHaveBeenCalledWith("google");
        });
        expect(sessionClient.login).toHaveBeenCalledWith({
            token_type: "clerk_broker_jwt",
            broker_token: "clerk.restored.jwt",
            platform: "android",
            client_version: "2.0.0",
        });
        await waitFor(() => {
            expect(contextValue?.state.authPhase).toBe("authenticated");
        });
        expect(contextValue).not.toBeNull();
        expect(contextValue!.lastAuthProvider).toBe("google");
    });

    it("clears the auth hint and upstream auth session on explicit sign out", async () => {
        const session = makeSession({
            accessToken: "access.login",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
        });
        const authService = makeAuthService({
            signIn: jest.fn().mockResolvedValue({
                provider: "google",
                tokenType: "clerk_broker_jwt",
                brokerToken: "clerk.broker.jwt",
                platform: "android",
                clientVersion: "2.0.0",
            }),
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(null),
            login: jest.fn().mockResolvedValue(session),
        });
        const hostedClient = makeHostedClient({
            getConduitsSnapshot: jest.fn().mockResolvedValue({
                entitlement: {
                    status: "active",
                    product_id: "test.product.primary",
                },
                conduits: [
                    {
                        conduit_id: "cond_1",
                        proxy_id: "st_1",
                        status: "active",
                    },
                ],
            }),
        });

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now: () => 10_000,
                    authService,
                    sessionClient,
                    hostedClient,
                    revenueCat: makeRevenueCatContext(),
                },
                <Consumer />,
            );
        });

        await act(async () => {
            await contextValue!.signIn("google");
        });
        await waitFor(() => {
            expect(contextValue).not.toBeNull();
            expect(contextValue!.lastAuthProvider).toBe("google");
        });

        await act(async () => {
            await contextValue!.signOut();
        });

        expect(authService.signOut).toHaveBeenCalledTimes(1);
        await expect(
            SecureStore.getItemAsync(SECURESTORE_HOSTED_LAST_AUTH_PROVIDER_KEY),
        ).resolves.toBeNull();
    });

    it("initializes revenuecat for loaded sessions without dev reconcile", async () => {
        const now = jest.fn().mockReturnValue(20_000);
        const existingSession = makeSession({
            accessToken: "access.loaded",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(existingSession),
        });
        const hostedClient = makeHostedClient();
        const revenueCat = makeRevenueCatContext({
            initialize: jest
                .fn()
                .mockResolvedValue(makeCustomerInfo(existingSession.accountId)),
            refreshCustomerInfo: jest
                .fn()
                .mockResolvedValue(makeCustomerInfo(existingSession.accountId)),
        });

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        function getContextValue(): HostedExperienceContextValue {
            if (!contextValue) {
                throw new Error("context unavailable");
            }
            return contextValue;
        }

        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now,
                    authService: makeAuthService(),
                    sessionClient,
                    hostedClient,
                    revenueCat,
                    revenueCatPublicKeys: {
                        ios: "appl_public",
                        android: "goog_public",
                    },
                },
                <Consumer />,
            );
        });

        await waitFor(() => {
            expect(revenueCat.initialize).toHaveBeenCalledWith({
                publicKeys: { ios: "appl_public", android: "goog_public" },
                accountId: existingSession.accountId,
            });
        });
        expect(hostedClient.reconcileRevenueCat).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(getContextValue().state.revenuecatPhase).toBe("ready");
        });
    });

    it("does not attempt dev reconcile during sign-in", async () => {
        const now = jest.fn().mockReturnValue(10_000);
        const session = makeSession({
            accessToken: "access.login",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
        });

        const authService = makeAuthService({
            signIn: jest.fn().mockResolvedValue({
                provider: "google",
                tokenType: "clerk_broker_jwt",
                brokerToken: "clerk.broker.jwt",
                platform: "android",
                clientVersion: "2.0.0",
            }),
        });

        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(null),
            login: jest.fn().mockResolvedValue(session),
        });

        const hostedClient = makeHostedClient({
            getConduitsSnapshot: jest.fn().mockResolvedValue({
                entitlement: {
                    status: "active",
                    product_id: "test.product.primary",
                },
                conduits: [
                    {
                        conduit_id: "cond_1",
                        proxy_id: "st_1",
                        status: "active",
                    },
                ],
            }),
        });

        const revenueCat = makeRevenueCatContext({
            initialize: jest
                .fn()
                .mockResolvedValue(makeCustomerInfo("acc_123")),
            refreshCustomerInfo: jest
                .fn()
                .mockResolvedValue(makeCustomerInfo("acc_123")),
        });

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        function getContextValue(): HostedExperienceContextValue {
            if (!contextValue) {
                throw new Error("context unavailable");
            }
            return contextValue;
        }

        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now,
                    authService,
                    sessionClient,
                    hostedClient,
                    revenueCat,
                    revenueCatPublicKeys: {
                        ios: "appl_public",
                        android: "goog_public",
                    },
                },
                <Consumer />,
            );
        });

        await act(async () => {
            await getContextValue().signIn("google");
        });
        await waitFor(() => {
            expect(getContextValue().state.revenuecatPhase).toBe("ready");
        });

        expect(getContextValue().state.revenuecatError).toBeNull();
        expect(hostedClient.reconcileRevenueCat).not.toHaveBeenCalled();
    });

    it("treats missing RevenueCat keys as a no-op bootstrap", async () => {
        const session = makeSession({
            accessToken: "access.loaded",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(session),
        });
        const revenueCat = makeRevenueCatContext();

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now: () => 20_000,
                    authService: makeAuthService(),
                    sessionClient,
                    hostedClient: makeHostedClient(),
                    revenueCat,
                },
                <Consumer />,
            );
        });

        await waitFor(() => {
            expect(contextValue!.state.authPhase).toBe("authenticated");
            expect(contextValue!.state.revenuecatPhase).toBe("ready");
        });
        expect(revenueCat.initialize).not.toHaveBeenCalled();
        expect(revenueCat.refreshCustomerInfo).not.toHaveBeenCalled();
        expect(revenueCat.logIn).not.toHaveBeenCalled();
    });

    it("seeds the hosted alias from a preserved local alias", async () => {
        await SecureStore.setItemAsync(
            SECURESTORE_CONDUIT_NAME_KEY,
            "Legacy Alias",
        );

        const session = makeSession({
            accessToken: "access.login",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
            accountProfile: {
                alias: "Generated Alias",
                alias_is_default: true,
                profile_version: 2,
            },
        });
        const authService = makeAuthService({
            signIn: jest.fn().mockResolvedValue({
                provider: "google",
                tokenType: "clerk_broker_jwt",
                brokerToken: "clerk.broker.jwt",
                platform: "android",
                clientVersion: "2.0.0",
            }),
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(null),
            login: jest.fn().mockResolvedValue(session),
        });
        const hostedClient = makeHostedClient({
            getAccountProfile: jest.fn().mockResolvedValue({
                alias: "Legacy Alias",
                alias_is_default: false,
                profile_version: 3,
            }),
            updateAccountProfile: jest.fn().mockResolvedValue({
                alias: "Legacy Alias",
                alias_is_default: false,
                profile_version: 3,
            }),
            getConduitsSnapshot: jest.fn().mockResolvedValue({
                account: {
                    alias: "Legacy Alias",
                    alias_is_default: false,
                    profile_version: 3,
                },
                entitlement: { status: "active" },
                conduits: [],
            }),
        });

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now: () => 10_000,
                    authService,
                    sessionClient,
                    hostedClient,
                    revenueCat: makeRevenueCatContext(),
                },
                <Consumer />,
            );
        });

        await act(async () => {
            await contextValue!.signIn("google");
        });
        expect(hostedClient.updateAccountProfile).toHaveBeenCalledWith(
            "access.login",
            {
                alias: "Legacy Alias",
                expected_profile_version: 2,
            },
        );
        await expect(
            SecureStore.getItemAsync(SECURESTORE_CONDUIT_NAME_KEY),
        ).resolves.toBe("Legacy Alias");
        await waitFor(() => {
            expect(contextValue!.state.accountProfile).toEqual({
                alias: "Legacy Alias",
                alias_is_default: false,
                profile_version: 3,
            });
        });
    });

    it("clears the local alias when the hosted alias is default and no local alias exists", async () => {
        const session = makeSession({
            accessToken: "access.login",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
            accountProfile: {
                alias: "Generated Alias",
                alias_is_default: true,
                profile_version: 2,
            },
        });
        const authService = makeAuthService({
            signIn: jest.fn().mockResolvedValue({
                provider: "google",
                tokenType: "clerk_broker_jwt",
                brokerToken: "clerk.broker.jwt",
                platform: "android",
                clientVersion: "2.0.0",
            }),
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(null),
            login: jest.fn().mockResolvedValue(session),
        });
        const hostedClient = makeHostedClient({
            getAccountProfile: jest.fn().mockResolvedValue({
                alias: "Generated Alias",
                alias_is_default: true,
                profile_version: 2,
            }),
            getConduitsSnapshot: jest.fn().mockResolvedValue({
                account: {
                    alias: "Generated Alias",
                    alias_is_default: true,
                    profile_version: 2,
                },
                entitlement: { status: "active" },
                conduits: [],
            }),
        });

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now: () => 10_000,
                    authService,
                    sessionClient,
                    hostedClient,
                    revenueCat: makeRevenueCatContext(),
                },
                <Consumer />,
            );
        });

        await act(async () => {
            await contextValue!.signIn("google");
        });

        expect(hostedClient.updateAccountProfile).not.toHaveBeenCalled();
        await expect(
            SecureStore.getItemAsync(SECURESTORE_CONDUIT_NAME_KEY),
        ).resolves.toBeNull();
        await waitFor(() => {
            expect(contextValue!.state.accountProfile).toEqual({
                alias: "Generated Alias",
                alias_is_default: true,
                profile_version: 2,
            });
        });
    });

    it("preserves the local alias when hosted alias seeding fails generically", async () => {
        await SecureStore.setItemAsync(
            SECURESTORE_CONDUIT_NAME_KEY,
            "Legacy Alias",
        );

        const session = makeSession({
            accessToken: "access.login",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
            accountProfile: {
                alias: "Generated Alias",
                alias_is_default: true,
                profile_version: 2,
            },
        });
        const authService = makeAuthService({
            signIn: jest.fn().mockResolvedValue({
                provider: "google",
                tokenType: "clerk_broker_jwt",
                brokerToken: "clerk.broker.jwt",
                platform: "android",
                clientVersion: "2.0.0",
            }),
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(null),
            login: jest.fn().mockResolvedValue(session),
        });
        const hostedClient = makeHostedClient({
            getAccountProfile: jest.fn().mockResolvedValue({
                alias: "Generated Alias",
                alias_is_default: true,
                profile_version: 2,
            }),
            updateAccountProfile: jest
                .fn()
                .mockRejectedValue(new Error("temporary upstream failure")),
            getConduitsSnapshot: jest.fn().mockResolvedValue({
                account: {
                    alias: "Generated Alias",
                    alias_is_default: true,
                    profile_version: 2,
                },
                entitlement: { status: "active" },
                conduits: [],
            }),
        });

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now: () => 10_000,
                    authService,
                    sessionClient,
                    hostedClient,
                    revenueCat: makeRevenueCatContext(),
                },
                <Consumer />,
            );
        });

        await act(async () => {
            await contextValue!.signIn("google");
        });

        await waitFor(() => {
            expect(contextValue!.state.authPhase).toBe("authenticated");
        });
        expect(hostedClient.getConduitsSnapshot).toHaveBeenCalledWith(
            "access.login",
        );
        await expect(
            SecureStore.getItemAsync(SECURESTORE_CONDUIT_NAME_KEY),
        ).resolves.toBe("Legacy Alias");
    });

    it("reconciles alias conflicts to the current server profile", async () => {
        const session = makeSession({
            accessToken: "access.login",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
            accountProfile: {
                alias: "Older Alias",
                alias_is_default: false,
                profile_version: 4,
            },
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(session),
        });
        const hostedClient = makeHostedClient({
            getAccountProfile: jest.fn().mockResolvedValue({
                alias: "Older Alias",
                alias_is_default: false,
                profile_version: 4,
            }),
            updateAccountProfile: jest.fn().mockRejectedValue(
                new HostedAccountProfileConflictError({
                    alias: "Server Alias",
                    alias_is_default: false,
                    profile_version: 5,
                }),
            ),
        });

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now: () => 20_000,
                    authService: makeAuthService(),
                    sessionClient,
                    hostedClient,
                    revenueCat: makeRevenueCatContext(),
                },
                <Consumer />,
            );
        });
        await flushPromises();

        let resolvedProfile: HostedSession["accountProfile"] = null;
        await act(async () => {
            resolvedProfile =
                await contextValue!.updateAccountAlias("Local Alias");
        });
        await waitFor(() => {
            expect(contextValue!.state.accountProfile).toEqual({
                alias: "Server Alias",
                alias_is_default: false,
                profile_version: 5,
            });
        });

        expect(resolvedProfile).toEqual({
            alias: "Server Alias",
            alias_is_default: false,
            profile_version: 5,
        });
        expect(contextValue!.state.accountProfile).toEqual({
            alias: "Server Alias",
            alias_is_default: false,
            profile_version: 5,
        });
        await expect(
            SecureStore.getItemAsync(SECURESTORE_CONDUIT_NAME_KEY),
        ).resolves.toBe("Server Alias");
    });

    it("refreshes stale persisted account profile state from HCB", async () => {
        const session = makeSession({
            accessToken: "access.loaded",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
            accountProfile: {
                alias: "Old Alias",
                alias_is_default: false,
                profile_version: 2,
            },
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(session),
        });
        const hostedClient = makeHostedClient({
            getAccountProfile: jest.fn().mockResolvedValue({
                alias: "New Alias",
                alias_is_default: false,
                profile_version: 3,
            }),
            getConduitsSnapshot: jest.fn().mockResolvedValue({
                account: {
                    alias: "New Alias",
                    alias_is_default: false,
                    profile_version: 3,
                },
                entitlement: { status: "active" },
                conduits: [],
                poll_after_seconds: 60,
            }),
        });

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now: () => 20_000,
                    authService: makeAuthService(),
                    sessionClient,
                    hostedClient,
                    revenueCat: makeRevenueCatContext(),
                },
                <Consumer />,
            );
        });
        await flushPromises();
        await flushPromises();

        expect(hostedClient.getAccountProfile).toHaveBeenCalledWith(
            "access.loaded",
        );
        expect(contextValue!.state.accountProfile).toEqual({
            alias: "New Alias",
            alias_is_default: false,
            profile_version: 3,
        });
        expect(sessionClient.persistHostedSession).toHaveBeenCalledWith(
            expect.objectContaining({
                accountProfile: {
                    alias: "New Alias",
                    alias_is_default: false,
                    profile_version: 3,
                },
            }),
        );
        await expect(
            SecureStore.getItemAsync(SECURESTORE_CONDUIT_NAME_KEY),
        ).resolves.toBe("New Alias");
    });
});

function makeSession(input: {
    accessToken: string;
    accessTokenExpiresAtMs: number;
    refreshTokenExpiresAtMs: number;
    accountProfile?: HostedSession["accountProfile"];
    personalPairingWrapperBaseUrl?: string | null;
}): HostedSession {
    return {
        accountId: "acc_123",
        accessToken: input.accessToken,
        accessTokenExpiresAtMs: input.accessTokenExpiresAtMs,
        refreshToken: "refresh.token",
        refreshTokenExpiresAtMs: input.refreshTokenExpiresAtMs,
        personalPairingWrapperBaseUrl:
            input.personalPairingWrapperBaseUrl ?? null,
        accountProfile: input.accountProfile ?? null,
    };
}

function makeAuthService(
    overrides?: Partial<HostedAuthService>,
): HostedAuthService {
    return {
        signIn: jest.fn(),
        restoreSignIn: jest.fn().mockResolvedValue(null),
        signOut: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

type SessionClient = Pick<
    ReturnType<typeof createHostedSessionClient>,
    | "login"
    | "refresh"
    | "loadHostedSession"
    | "persistHostedSession"
    | "clearHostedSession"
>;

function makeSessionClient(overrides?: Partial<SessionClient>): SessionClient {
    return {
        login: jest.fn(),
        refresh: jest.fn(),
        loadHostedSession: jest.fn().mockResolvedValue(null),
        persistHostedSession: jest.fn(),
        clearHostedSession: jest.fn(),
        ...overrides,
    };
}

type HostedClient = Pick<
    ReturnType<typeof createHostedClient>,
    | "getAccountProfile"
    | "updateAccountProfile"
    | "setPersonalCompartmentId"
    | "getConduitsSnapshot"
    | "getPlanCatalog"
    | "createStatsSession"
    | "getSummary"
    | "getRecent"
    | "getLive"
    | "reconcileRevenueCat"
    | "resetDevState"
>;

function makeHostedClient(overrides?: Partial<HostedClient>): HostedClient {
    return {
        getAccountProfile: jest.fn().mockResolvedValue({
            alias: "Server Alias",
            alias_is_default: false,
            profile_version: 1,
        }),
        updateAccountProfile: jest.fn(),
        setPersonalCompartmentId: jest
            .fn()
            .mockResolvedValue("jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g"),
        getConduitsSnapshot: jest.fn(),
        getPlanCatalog: jest.fn(),
        createStatsSession: jest.fn(),
        getSummary: jest.fn(),
        getRecent: jest.fn(),
        getLive: jest.fn(),
        reconcileRevenueCat: jest.fn().mockResolvedValue(undefined),
        resetDevState: jest.fn().mockResolvedValue({
            status: "ok",
            account_id: "acc_123",
        }),
        ...overrides,
    };
}

function renderHostedExperience(
    providerProps: React.ComponentProps<typeof HostedExperienceProvider>,
    child: React.ReactNode,
): ReactTestRenderer {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: Infinity },
            mutations: { retry: false, gcTime: Infinity },
        },
    });

    const renderer = create(
        <QueryClientProvider client={queryClient}>
            <HostedExperienceProvider {...providerProps}>
                {child}
            </HostedExperienceProvider>
        </QueryClientProvider>,
    );
    mountedQueryClients.push(queryClient);
    mountedRenderers.push(renderer);
    return renderer;
}

const mountedRenderers: ReactTestRenderer[] = [];
const mountedQueryClients: QueryClient[] = [];

async function flushPromises(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

async function waitFor(assertion: () => void): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 12; attempt += 1) {
        try {
            assertion();
            return;
        } catch (error) {
            lastError = error;
            await flushPromises();
        }
    }

    throw lastError;
}

function makeRevenueCatContext(
    overrides?: Partial<RevenueCatContextValue>,
): RevenueCatContextValue {
    return {
        customerInfo: null,
        configure: jest.fn(),
        initialize: jest.fn().mockResolvedValue(makeCustomerInfo("acc_123")),
        logIn: jest.fn().mockResolvedValue(makeCustomerInfo("acc_123")),
        refreshCustomerInfo: jest
            .fn()
            .mockResolvedValue(makeCustomerInfo("acc_123")),
        getOfferings: jest.fn().mockResolvedValue({ current: null }),
        restorePurchases: jest.fn().mockResolvedValue({
            customerInfo: makeCustomerInfo("acc_123"),
        }),
        purchasePackage: jest.fn().mockResolvedValue({
            customerInfo: makeCustomerInfo("acc_123"),
            productIdentifier: "test.product.primary",
        }),
        ...overrides,
    };
}

function makeCustomerInfo(accountId: string): CustomerInfo {
    return {
        entitlements: {
            all: {
                conduit: {
                    identifier: "conduit",
                    isActive: true,
                    willRenew: true,
                    periodType: "normal",
                    latestPurchaseDate: "2026-02-06T00:00:00.000Z",
                    originalPurchaseDate: "2026-02-06T00:00:00.000Z",
                    expirationDate: "2026-03-06T00:00:00.000Z",
                    store: "app_store",
                    productIdentifier: "test.product.primary",
                    ownershipType: "PURCHASED",
                    verification: "NOT_REQUESTED",
                    expirationDateMillis: Date.parse(
                        "2026-03-06T00:00:00.000Z",
                    ),
                    latestPurchaseDateMillis: Date.parse(
                        "2026-02-06T00:00:00.000Z",
                    ),
                    originalPurchaseDateMillis: Date.parse(
                        "2026-02-06T00:00:00.000Z",
                    ),
                },
            },
            active: {
                conduit: {
                    identifier: "conduit",
                    isActive: true,
                    willRenew: true,
                    periodType: "normal",
                    latestPurchaseDate: "2026-02-06T00:00:00.000Z",
                    originalPurchaseDate: "2026-02-06T00:00:00.000Z",
                    expirationDate: "2026-03-06T00:00:00.000Z",
                    store: "app_store",
                    productIdentifier: "test.product.primary",
                    ownershipType: "PURCHASED",
                    verification: "NOT_REQUESTED",
                    expirationDateMillis: Date.parse(
                        "2026-03-06T00:00:00.000Z",
                    ),
                    latestPurchaseDateMillis: Date.parse(
                        "2026-02-06T00:00:00.000Z",
                    ),
                    originalPurchaseDateMillis: Date.parse(
                        "2026-02-06T00:00:00.000Z",
                    ),
                },
            },
            verification: "NOT_REQUESTED",
        },
        activeSubscriptions: ["test.product.primary"],
        allPurchasedProductIdentifiers: ["test.product.primary"],
        latestExpirationDate: "2026-03-06T00:00:00.000Z",
        originalAppUserId: accountId,
        originalApplicationVersion: null,
        requestDate: "2026-02-06T00:00:00.000Z",
        firstSeen: "2026-02-06T00:00:00.000Z",
        managementURL: null,
        originalPurchaseDate: "2026-02-06T00:00:00.000Z",
        nonSubscriptionTransactions: [],
        subscriptionsByProductIdentifier: {
            "test.product.primary": {
                isSandbox: true,
                ownershipType: "PURCHASED",
                periodType: "normal",
                purchaseDate: "2026-02-06T00:00:00.000Z",
                originalPurchaseDate: "2026-02-06T00:00:00.000Z",
                expiresDate: "2026-03-06T00:00:00.000Z",
                store: "app_store",
                unsubscribeDetectedAt: null,
                billingIssueDetectedAt: null,
                gracePeriodExpiresDate: null,
                refundedAt: null,
                autoResumeDate: null,
                verification: "NOT_REQUESTED",
            },
        },
    } as unknown as CustomerInfo;
}

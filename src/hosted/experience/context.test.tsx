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
import { base64nopad, base64urlnopad } from "@scure/base";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import { createInstance } from "i18next";
import React from "react";
import { I18nextProvider } from "react-i18next";
import { AppState, AppStateStatus, Platform, Share } from "react-native";
import type { CustomerInfo } from "react-native-purchases";
import { ReactTestRenderer, act, create } from "react-test-renderer";

import { createOrLoadAccount } from "@/src/auth/account";
import {
    ConduitActionsProvider,
    useConduitActions,
} from "@/src/components/ConduitActionsContext";
import { ModalHost, ModalProvider } from "@/src/components/ModalStore";
import { PersonalPairingShareModal } from "@/src/components/PersonalPairingShareModal";
import {
    QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID,
    SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
    SECURESTORE_CONDUIT_NAME_KEY,
    SECURESTORE_DEVICE_NONCE_KEY,
    SECURESTORE_HOSTED_LAST_AUTH_PROVIDER_KEY,
    SECURESTORE_MNEMONIC_KEY,
} from "@/src/constants";
import { useAndroidPersonalCompartmentId } from "@/src/hooks";
import {
    HostedAccountProfileConflictError,
    HostedApiClientRequestError,
    HostedPersonalCompartmentIdConflictError,
    createHostedApiClient,
} from "@/src/hosted/apiClient";
import { HostedAuthService } from "@/src/hosted/auth/types";
import { ConduitsSnapshot } from "@/src/hosted/contracts";
import {
    HostedExperienceContextValue,
    HostedExperienceProvider,
    useHostedExperienceContext,
} from "@/src/hosted/experience/context";
import { hostedQueryKeys } from "@/src/hosted/queryKeys";
import { RevenueCatContextValue } from "@/src/hosted/revenuecatContext";
import {
    HostedSession,
    createHostedSessionClient,
} from "@/src/hosted/sessionClient";
import { InproxyProvider, useInproxyContext } from "@/src/inproxy/context";
import type { ConduitModuleAPI } from "@/src/inproxy/module";
import type { PairingConfiguration } from "@/src/inproxy/pairingConfiguration";
import type { InproxyEvent, InproxyParameters } from "@/src/inproxy/types";
import { PairingTokenPayloadV1Schema } from "@/src/pairing/token";

describe("hosted experience context", () => {
    const originalPlatformOs = Platform.OS;
    const appStateListeners = new Set<(state: AppStateStatus) => void>();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(Network.useNetworkState).mockReturnValue({
            isConnected: true,
            isInternetReachable: true,
        });
        appStateListeners.clear();
        jest.spyOn(AppState, "addEventListener").mockImplementation(
            (_, listener) => {
                appStateListeners.add(listener);
                return { remove: () => appStateListeners.delete(listener) };
            },
        );
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
        jest.restoreAllMocks();
    });

    afterAll(() => {
        Object.defineProperty(Platform, "OS", {
            configurable: true,
            value: originalPlatformOs,
        });
    });

    it.each(["failed login sync", "restored session"])(
        "recovers compartment sync after %s while sharing only native readback",
        async (sessionMode) => {
            const i18n = createInstance();
            await i18n.init({ lng: "en", resources: {} });
            const localId = "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g";
            const hostedId = "N8nN1DTLcuNj3DG39uUyIqBP+xKujq6IAklKO1f1Ftk";
            await SecureStore.setItemAsync(
                SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
                localId,
            );
            await SecureStore.setItemAsync(
                SECURESTORE_CONDUIT_NAME_KEY,
                "Pairing Station",
            );
            const session = makeSession({
                accessToken: "access.pairing",
                accessTokenExpiresAtMs: 90_000,
                refreshTokenExpiresAtMs: 1_000_000,
            });
            const listeners = new Set<(event: InproxyEvent) => void>();
            let nativeEvent: InproxyEvent = {
                type: "proxyState",
                data: {
                    status: "RUNNING",
                    networkState: "NO_INTERNET",
                    pairingConfiguration: {
                        revision: 10,
                        status: "applied",
                        personalCompartmentId: localId,
                    },
                },
            };
            const emitNativeState = (event: InproxyEvent) => {
                nativeEvent = event;
                listeners.forEach((listener) => listener(event));
            };
            async function receiveNativePairing(
                pairingConfiguration: PairingConfiguration,
                status: "RUNNING" | "STOPPED" = "RUNNING",
            ) {
                await act(async () => {
                    emitNativeState({
                        type: "proxyState",
                        data: {
                            status,
                            networkState: "NO_INTERNET",
                            pairingConfiguration,
                        },
                    });
                });
                await flushPromises();
            }
            let desiredParams: InproxyParameters | undefined;
            let failDispatch = false;
            let syncAttempts = 0;
            let syncAvailable = false;
            const nativeModule: ConduitModuleAPI = {
                addInproxyEventListener: (listener) => {
                    listeners.add(listener);
                    return {
                        remove: () => {
                            listeners.delete(listener);
                        },
                    };
                },
                addIpcEventListener: () => ({ remove: () => {} }),
                emitCurrentInproxyState: () => emitNativeState(nativeEvent),
                paramsChanged: async (params) => {
                    if (failDispatch)
                        throw new Error("Pairing test dispatch failed");
                    desiredParams = params;
                },
                toggleInProxy: async () => {},
                sendFeedback: async () => null,
                logInfo: () => {},
                logWarn: () => {},
                logError: () => {},
            };
            let actions: ReturnType<typeof useConduitActions> | undefined;
            let inproxy: ReturnType<typeof useInproxyContext> | undefined;
            let hosted: HostedExperienceContextValue | undefined;
            function Consumer() {
                actions = useConduitActions();
                inproxy = useInproxyContext();
                hosted = useHostedExperienceContext();
                return null;
            }
            let renderer: ReactTestRenderer;
            await act(async () => {
                renderer = renderHostedExperience(
                    {
                        baseUrl: "https://hcb.example.test",
                        now: () => 20_000,
                        authService: makeAuthService({
                            signIn: async () => ({
                                provider: "google",
                                tokenType: "clerk_broker_jwt",
                                brokerToken: "test",
                                platform: "android",
                                clientVersion: "test",
                            }),
                        }),
                        sessionClient: makeSessionClient({
                            login: async () => session,
                            refresh: async () => ({
                                ...session,
                                accessToken: "access.refreshed",
                                accessTokenExpiresAtMs: 180_000,
                            }),
                            loadHostedSession: async () =>
                                sessionMode === "restored session"
                                    ? session
                                    : null,
                        }),
                        apiClient: makeHostedClient({
                            setPersonalCompartmentId: async () => {
                                syncAttempts++;
                                if (syncAvailable) return hostedId;
                                throw new Error(
                                    "Pairing test sync unavailable",
                                );
                            },
                            getConduitsSnapshot: async () => ({
                                entitlement: { status: "active" },
                                conduits: [
                                    {
                                        conduit_id: "cond_1",
                                        proxy_id: "st_1",
                                        status: "active",
                                        traffic_scope: "personal",
                                        personal_compartment_id: hostedId,
                                    },
                                ],
                            }),
                        }),
                        revenueCat: makeRevenueCatContext(),
                    },
                    <I18nextProvider i18n={i18n}>
                        <ModalProvider>
                            <InproxyProvider module={nativeModule}>
                                <ConduitActionsProvider>
                                    <Consumer />
                                    <ModalHost />
                                </ConduitActionsProvider>
                            </InproxyProvider>
                        </ModalProvider>
                    </I18nextProvider>,
                );
            });
            await waitFor(() =>
                expect(hosted?.initialSessionResolved).toBe(true),
            );
            if (sessionMode === "failed login sync") {
                await act(async () => {
                    await hosted?.signIn("google");
                });
            }
            await waitFor(() =>
                expect(
                    hosted?.state.conduitsSnapshot?.conduits[0]
                        ?.personal_compartment_id,
                ).toBe(hostedId),
            );
            await waitFor(() =>
                expect(desiredParams?.personalCompartmentId).toBe(localId),
            );
            await waitFor(() => expect(syncAttempts).toBe(3));
            // Same-account token refresh/polling must not reset the retry budget.
            await act(async () => {
                await hosted?.refreshSession();
                await hosted?.pollConduitsOnce();
            });
            expect(syncAttempts).toBe(3);
            expect(
                hosted?.state.conduitsSnapshot?.conduits[0]
                    ?.personal_compartment_id,
            ).toBe(hostedId);
            expect(desiredParams?.personalCompartmentId).toBe(localId);
            await expect(
                SecureStore.getItemAsync(
                    SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
                ),
            ).resolves.toBe(localId);
            expect(actions?.personalCompartmentId).toBeNull();
            await act(async () => {
                emitNativeState(nativeEvent);
            });
            await flushPromises();
            expect(actions?.personalCompartmentId).toBe(localId);
            await act(async () => {
                actions?.openPersonalPairingModal();
            });
            const modal = () =>
                renderer.root.findByType(PersonalPairingShareModal);
            expect(modal().props.personalCompartmentId).toBe(localId);
            await waitFor(() =>
                expect(desiredParams?.personalCompartmentId).toBe(localId),
            );
            if (!desiredParams)
                throw new Error("Pairing test parameters unavailable");
            async function expectSharedIdentity(expectedId: string) {
                const share = jest
                    .spyOn(Share, "share")
                    .mockResolvedValue({ action: Share.sharedAction });
                try {
                    await act(async () => {
                        modal()
                            .findByProps({ disabled: false })
                            .props.onPress();
                    });
                    const token = (
                        share.mock.calls[0]?.[0].message ?? ""
                    ).split("/pair/")[1];
                    expect(
                        PairingTokenPayloadV1Schema.parse(
                            JSON.parse(
                                new TextDecoder().decode(
                                    base64urlnopad.decode(token),
                                ),
                            ),
                        ).data.id,
                    ).toBe(expectedId);
                } finally {
                    share.mockRestore();
                }
            }
            await expectSharedIdentity(localId);
            syncAvailable = true;
            await act(async () => {
                appStateListeners.forEach((listener) => listener("background"));
                appStateListeners.forEach((listener) => listener("active"));
            });
            await waitFor(() =>
                expect(desiredParams?.personalCompartmentId).toBe(hostedId),
            );
            expect(syncAttempts).toBe(4);
            await expect(
                SecureStore.getItemAsync(
                    SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
                ),
            ).resolves.toBe(hostedId);
            const nextParams = {
                ...desiredParams,
                personalCompartmentId: hostedId,
            };
            // Dispatch returning is not acknowledgement; an open modal still shares A.
            expect(modal().props.personalCompartmentId).toBe(localId);
            await receiveNativePairing({
                revision: 11,
                status: "applying",
                personalCompartmentId: null,
            });
            expect(modal().props.personalCompartmentId).toBeNull();
            expect(modal().findByProps({ disabled: true })).toBeDefined();
            await receiveNativePairing({
                revision: 12,
                status: "applied",
                personalCompartmentId: hostedId,
            });
            expect(modal().props.personalCompartmentId).toBe(hostedId);
            await expectSharedIdentity(hostedId);
            await receiveNativePairing({
                revision: 10,
                status: "applied",
                personalCompartmentId: localId,
            });
            expect(modal().props.personalCompartmentId).toBe(hostedId);
            failDispatch = true;
            const errorLog = jest
                .spyOn(console, "error")
                .mockImplementation(() => {});
            try {
                await act(async () => {
                    await inproxy?.selectInproxyParameters({
                        ...nextParams,
                        personalCompartmentId: localId,
                    });
                });
                expect(modal().props.personalCompartmentId).toBe(hostedId);
            } finally {
                errorLog.mockRestore();
            }
            // Restart failure may persist a new ID, but only actual STOPPED readback enables it.
            await receiveNativePairing({
                revision: 13,
                status: "applying",
                personalCompartmentId: null,
            });
            expect(modal().props.personalCompartmentId).toBeNull();
            await receiveNativePairing(
                {
                    revision: 14,
                    status: "persisted",
                    personalCompartmentId: localId,
                },
                "STOPPED",
            );
            expect(modal().props.personalCompartmentId).toBe(localId);
        },
    );

    it("fails clearly without an injected or context auth service", () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const consoleError = jest
            .spyOn(console, "error")
            .mockImplementation(() => {});

        try {
            expect(() => {
                act(() => {
                    create(
                        <QueryClientProvider client={queryClient}>
                            <HostedExperienceProvider
                                baseUrl="https://hcb.example.test"
                                revenueCat={makeRevenueCatContext()}
                            >
                                <React.Fragment />
                            </HostedExperienceProvider>
                        </QueryClientProvider>,
                    );
                });
            }).toThrow(
                "HostedExperienceProvider requires an authService or a parent <HostedAuthProvider />",
            );
        } finally {
            consoleError.mockRestore();
            queryClient.clear();
        }
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
                    apiClient: hostedClient,
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
        await waitFor(() =>
            expect(getContextValue().state.authPhase).toBe("authenticated"),
        );
        expect(getContextValue().state.revenuecatPhase).toBe("ready");
        expect(getContextValue().state.stationPhase).toBe("active");
        expect(getContextValue().state.entitlementSnapshot).toBe("active");

        act(() => {
            renderer!.unmount();
        });
    });

    it.each(["first hosted account", "second device conflict"])(
        "converges local native parameters after a delayed sync for %s",
        async (accountMode) => {
            // App startup initializes account keys before mounting InproxyProvider.
            // Leave the compartment ID absent so the real local hook derives it.
            await SecureStore.setItemAsync(
                SECURESTORE_MNEMONIC_KEY,
                "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
            );
            await SecureStore.setItemAsync(SECURESTORE_DEVICE_NONCE_KEY, "1");
            const account = await createOrLoadAccount();
            if (account instanceof Error) throw account;
            const localId = base64nopad.encode(account.inproxyKey.publicKey);
            const hostedId =
                accountMode === "first hosted account"
                    ? localId
                    : "N8nN1DTLcuNj3DG39uUyIqBP+xKujq6IAklKO1f1Ftk";
            let registeredId =
                accountMode === "first hosted account" ? null : hostedId;
            const syncResponse = createDeferred<string>();
            const session = makeSession({
                accessToken: "access.login",
                accessTokenExpiresAtMs: 90_000,
                refreshTokenExpiresAtMs: 1_000_000,
            });
            const submittedIds: string[] = [];
            const dispatched: InproxyParameters[] = [];
            const nativeModule: ConduitModuleAPI = {
                addInproxyEventListener: () => ({ remove: () => {} }),
                addIpcEventListener: () => ({ remove: () => {} }),
                emitCurrentInproxyState: () => {},
                paramsChanged: async (params) => {
                    dispatched.push(params);
                },
                toggleInProxy: async () => {},
                sendFeedback: async () => null,
                logInfo: () => {},
                logWarn: () => {},
                logError: () => {},
            };
            let hosted: HostedExperienceContextValue | undefined;
            function Consumer() {
                hosted = useHostedExperienceContext();
                return null;
            }
            await act(async () => {
                renderHostedExperience(
                    {
                        baseUrl: "https://hcb.example.test",
                        now: () => 10_000,
                        authService: makeAuthService({
                            signIn: async () => ({
                                provider: "google",
                                tokenType: "clerk_broker_jwt",
                                brokerToken: "test",
                                platform: "android",
                                clientVersion: "test",
                            }),
                        }),
                        sessionClient: makeSessionClient({
                            login: async () => session,
                        }),
                        apiClient: makeHostedClient({
                            setPersonalCompartmentId: async (_, id) => {
                                submittedIds.push(id);
                                registeredId ??= id;
                                return syncResponse.promise;
                            },
                            getConduitsSnapshot: async () => ({
                                entitlement: { status: "active" },
                                conduits: registeredId
                                    ? [
                                          {
                                              conduit_id: "cond_1",
                                              proxy_id: "st_1",
                                              status: "active",
                                              traffic_scope: "personal",
                                              personal_compartment_id:
                                                  registeredId,
                                          },
                                      ]
                                    : [],
                            }),
                        }),
                        revenueCat: makeRevenueCatContext(),
                    },
                    <InproxyProvider module={nativeModule}>
                        <Consumer />
                    </InproxyProvider>,
                );
            });
            await waitFor(() => {
                expect(hosted?.initialSessionResolved).toBe(true);
                expect(dispatched.at(-1)?.personalCompartmentId).toBe(localId);
            });
            let signIn: Promise<void> | undefined;
            await act(async () => {
                signIn = hosted?.signIn("google");
            });
            await waitFor(() => {
                expect(submittedIds).toEqual([localId]);
                // Session publication enables snapshot loading before sync finishes.
                expect(
                    hosted?.state.conduitsSnapshot?.conduits[0]
                        ?.personal_compartment_id,
                ).toBe(hostedId);
            });
            expect(dispatched.at(-1)?.personalCompartmentId).toBe(localId);
            await act(async () => {
                appStateListeners.forEach((listener) => listener("background"));
                appStateListeners.forEach((listener) => listener("active"));
            });
            expect(submittedIds).toEqual([localId]);
            await act(async () => {
                if (accountMode === "second device conflict") {
                    syncResponse.reject(
                        new HostedPersonalCompartmentIdConflictError(hostedId),
                    );
                } else {
                    syncResponse.resolve(localId);
                }
                await signIn;
            });
            await waitFor(() =>
                expect(dispatched.at(-1)?.personalCompartmentId).toBe(hostedId),
            );
            await expect(
                SecureStore.getItemAsync(
                    SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
                ),
            ).resolves.toBe(hostedId);
        },
    );

    it.each([
        "sign out",
        "sign out with stale 401",
        "sign out during storage write",
        "switch account",
        "switch during storage write",
    ])(
        "discards obsolete compartment reconciliation after %s",
        async (transition) => {
            const signingOut = transition.startsWith("sign out");
            const writing = transition.endsWith("storage write");
            const localId = "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g";
            const obsoleteId = "N8nN1DTLcuNj3DG39uUyIqBP+xKujq6IAklKO1f1Ftk";
            const canonicalId = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
            await SecureStore.setItemAsync(
                SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
                localId,
            );
            const session = makeSession({
                accessToken: "access.old",
                accessTokenExpiresAtMs: 90_000,
                refreshTokenExpiresAtMs: 1_000_000,
            });
            const nextSession = {
                ...session,
                accountId: "acc_next",
                accessToken: "access.next",
            };
            const oldResponse = createDeferred<string>();
            const storageWrite = createDeferred<void>();
            const storageStarted = createDeferred<void>();
            const upstreamSignOut = createDeferred<void>();
            const write = jest
                .mocked(SecureStore.setItemAsync)
                .getMockImplementation();
            if (!write) throw new Error("Pairing test storage unavailable");
            if (writing) {
                jest.spyOn(SecureStore, "setItemAsync").mockImplementation(
                    async (key, value, options) => {
                        if (
                            key ===
                                SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY &&
                            value === obsoleteId
                        ) {
                            storageStarted.resolve();
                            await storageWrite.promise;
                        }
                        return write(key, value, options);
                    },
                );
            }
            const requests: string[] = [];
            let hosted: HostedExperienceContextValue | undefined;
            let desiredId: string | null | undefined;
            function Consumer() {
                hosted = useHostedExperienceContext();
                desiredId = useAndroidPersonalCompartmentId().data;
                return null;
            }
            await act(async () => {
                renderHostedExperience(
                    {
                        baseUrl: "https://hcb.example.test",
                        now: () => 10_000,
                        authService: makeAuthService({
                            signOut: async () => upstreamSignOut.promise,
                            signIn: async () => ({
                                provider: "google",
                                tokenType: "clerk_broker_jwt",
                                brokerToken: "test",
                                platform: "android",
                                clientVersion: "test",
                            }),
                        }),
                        sessionClient: makeSessionClient({
                            loadHostedSession: async () => session,
                            login: async () => nextSession,
                        }),
                        apiClient: makeHostedClient({
                            setPersonalCompartmentId: async (token) => {
                                requests.push(token);
                                if (token === "access.old")
                                    return oldResponse.promise;
                                throw new HostedPersonalCompartmentIdConflictError(
                                    canonicalId,
                                );
                            },
                            getConduitsSnapshot: async () =>
                                makeConduitsSnapshot("active"),
                        }),
                        revenueCat: makeRevenueCatContext(),
                    },
                    <Consumer />,
                );
            });
            await waitFor(() => {
                expect(requests).toEqual(["access.old"]);
                expect(desiredId).toBe(localId);
            });
            if (writing) {
                await act(async () => {
                    oldResponse.resolve(obsoleteId);
                    await storageStarted.promise;
                });
            }
            let signOut: Promise<void> | undefined;
            await act(async () => {
                if (signingOut) signOut = hosted?.signOut();
                else await hosted?.signIn("google");
            });
            await act(async () => {
                if (transition === "sign out with stale 401") {
                    oldResponse.reject(
                        new HostedApiClientRequestError(
                            "Pairing test stale token",
                            401,
                            "unauthorized",
                        ),
                    );
                } else {
                    oldResponse.resolve(obsoleteId);
                }
                storageWrite.resolve();
            });
            if (signingOut) {
                // Invalidated at sign-out invocation, before upstream auth completes.
                expect(desiredId).toBe(localId);
                await expect(
                    SecureStore.getItemAsync(
                        SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
                    ),
                ).resolves.toBe(localId);
                await act(async () => {
                    upstreamSignOut.resolve();
                    await signOut;
                });
            }
            const expectedId = signingOut ? localId : canonicalId;
            await waitFor(() => {
                expect(desiredId).toBe(expectedId);
                expect(hosted?.state.session?.accountId ?? null).toBe(
                    signingOut ? null : "acc_next",
                );
            });
            await expect(
                SecureStore.getItemAsync(
                    SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
                ),
            ).resolves.toBe(expectedId);
            expect(requests).toEqual(
                signingOut ? ["access.old"] : ["access.old", "access.next"],
            );
        },
    );

    it("bounds failed sync bursts and recovers on reconnect without blocking offline auth or local identity", async () => {
        const localId = "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g";
        await SecureStore.setItemAsync(
            SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
            localId,
        );
        const session = makeSession({
            accessToken: "access.offline",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
        });
        let attempts = 0;
        let available = false;
        const retryDelays: number[] = [];
        let hosted: HostedExperienceContextValue | undefined;
        let desiredId: string | null | undefined;
        function Consumer() {
            hosted = useHostedExperienceContext();
            desiredId = useAndroidPersonalCompartmentId().data;
            return null;
        }
        jest.mocked(Network.useNetworkState).mockReturnValue({
            isConnected: false,
            isInternetReachable: false,
        });
        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now: () => 10_000,
                    delay: async (ms) => {
                        retryDelays.push(ms);
                    },
                    authService: makeAuthService(),
                    sessionClient: makeSessionClient({
                        loadHostedSession: async () => session,
                        refresh: async () => ({
                            ...session,
                            accessToken: "access.refreshed",
                            accessTokenExpiresAtMs: 180_000,
                        }),
                    }),
                    apiClient: makeHostedClient({
                        setPersonalCompartmentId: async () => {
                            attempts++;
                            if (available) return localId;
                            throw new Error("Pairing test unavailable");
                        },
                        getConduitsSnapshot: async () =>
                            makeConduitsSnapshot("active"),
                    }),
                    revenueCat: makeRevenueCatContext(),
                },
                <Consumer />,
            );
        });
        await waitFor(() => expect(desiredId).toBe(localId));
        expect(hosted?.state.authPhase).toBe("authenticated");
        expect(attempts).toBe(0);
        const queryClient = mountedQueryClients[mountedQueryClients.length - 1];
        async function setOnline(online: boolean) {
            jest.mocked(Network.useNetworkState).mockReturnValue({
                isConnected: online,
                isInternetReachable: online,
            });
            await act(async () => {
                // Token changes force the provider to observe the external network state.
                queryClient.setQueryData(
                    hostedQueryKeys.session("https://hcb.example.test"),
                    {
                        ...session,
                        accessToken: online
                            ? "access.online"
                            : "access.offline",
                    },
                );
            });
            await waitFor(() => expect(hosted?.isOffline).toBe(!online));
        }
        await setOnline(true);
        await waitFor(() => expect(attempts).toBe(3));
        expect(retryDelays).toEqual([1000, 4000]);
        await act(async () => {
            await hosted?.refreshSession();
            await hosted?.pollConduitsOnce();
        });
        expect(attempts).toBe(3);
        await setOnline(false);
        await act(async () => {
            appStateListeners.forEach((listener) => listener("background"));
            appStateListeners.forEach((listener) => listener("active"));
        });
        expect(attempts).toBe(3);
        await setOnline(true);
        await waitFor(() => expect(attempts).toBe(6));
        expect(retryDelays).toEqual([1000, 4000, 1000, 4000]);
        await setOnline(false);
        available = true;
        await setOnline(true);
        await waitFor(() => expect(attempts).toBe(7));
        await flushPromises();
        await setOnline(false);
        await setOnline(true);
        expect(attempts).toBe(7);
        expect(desiredId).toBe(localId);
        expect(hosted?.state.authPhase).toBe("authenticated");
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
                    apiClient: hostedClient,
                    revenueCat: makeRevenueCatContext(),
                },
                <Consumer />,
            );
        });

        const queryClient = mountedQueryClients[mountedQueryClients.length - 1];
        const staleIdentityRead = createDeferred<string>();
        const pendingRead = queryClient
            .fetchQuery({
                queryKey: [QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID],
                queryFn: () => staleIdentityRead.promise,
            })
            .catch(() => undefined); // Cancellation is expected after reconciliation.
        await act(async () => {
            await contextValue!.signIn("google");
            staleIdentityRead.resolve(
                "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g",
            );
            await pendingRead;
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
                    apiClient: hostedClient,
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
                    apiClient: hostedClient,
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

    it("can force-refresh a still-current session", async () => {
        const now = jest.fn().mockReturnValue(20_000);
        const oldProfile = {
            alias: "Old Alias",
            alias_is_default: false,
            profile_version: 1,
        };
        const newProfile = {
            alias: "New Alias",
            alias_is_default: false,
            profile_version: 2,
        };
        const currentSession = makeSession({
            accessToken: "access.old",
            accessTokenExpiresAtMs: 200_000,
            refreshTokenExpiresAtMs: 400_000,
            accountProfile: oldProfile,
        });
        const refreshedSession = {
            ...currentSession,
            accessToken: "access.new",
            accessTokenExpiresAtMs: 400_000,
            accountProfile: newProfile,
        };

        let storedSession = currentSession;
        const sessionClient = makeSessionClient({
            loadHostedSession: jest
                .fn()
                .mockImplementation(async () => storedSession),
            refresh: jest.fn().mockImplementation(async () => {
                storedSession = refreshedSession;
                return refreshedSession;
            }),
            persistHostedSession: jest
                .fn()
                .mockImplementation(async (session) => {
                    storedSession = session;
                }),
        });

        const hostedClient = makeHostedClient({
            getAccountProfile: jest.fn().mockResolvedValue(oldProfile),
        });
        const revenueCat = makeRevenueCatContext();
        const authService = makeAuthService();

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now,
                    authService,
                    sessionClient,
                    apiClient: hostedClient,
                    revenueCat,
                },
                <Consumer />,
            );
        });
        await waitFor(() => {
            expect(contextValue!.state.accountProfile?.alias).toBe("Old Alias");
        });

        await act(async () => {
            await contextValue!.refreshSession();
        });
        await flushPromises();

        expect(sessionClient.refresh).toHaveBeenCalledTimes(1);
        expect(contextValue!.state.session?.accessToken).toBe("access.new");
        expect(contextValue!.state.accountProfile?.alias).toBe("New Alias");
    });

    it("refreshes and retries hosted API calls after a still-current token 401", async () => {
        const now = jest.fn().mockReturnValue(20_000);
        const currentSession = makeSession({
            accessToken: "access.old",
            accessTokenExpiresAtMs: 200_000,
            refreshTokenExpiresAtMs: 400_000,
        });
        const refreshedSession = {
            ...currentSession,
            accessToken: "access.new",
            accessTokenExpiresAtMs: 400_000,
        };

        let storedSession = currentSession;
        const sessionClient = makeSessionClient({
            loadHostedSession: jest
                .fn()
                .mockImplementation(async () => storedSession),
            refresh: jest.fn().mockImplementation(async () => {
                storedSession = refreshedSession;
                return refreshedSession;
            }),
            persistHostedSession: jest
                .fn()
                .mockImplementation(async (session) => {
                    storedSession = session;
                }),
        });

        const hostedClient = makeHostedClient({
            getConduitsSnapshot: jest
                .fn()
                .mockRejectedValueOnce(
                    new HostedApiClientRequestError(
                        "access token rejected",
                        401,
                    ),
                )
                .mockResolvedValueOnce({
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
        const revenueCat = makeRevenueCatContext();
        const authService = makeAuthService();

        let contextValue: HostedExperienceContextValue | null = null;
        function Consumer() {
            contextValue = useHostedExperienceContext();
            return null;
        }

        await act(async () => {
            renderHostedExperience(
                {
                    baseUrl: "https://hcb.example.test",
                    now,
                    authService,
                    sessionClient,
                    apiClient: hostedClient,
                    revenueCat,
                },
                <Consumer />,
            );
        });

        await waitFor(() => {
            expect(hostedClient.getConduitsSnapshot).toHaveBeenCalledWith(
                "access.new",
            );
        });

        expect(sessionClient.refresh).toHaveBeenCalledTimes(1);
        expect(hostedClient.getConduitsSnapshot).toHaveBeenNthCalledWith(
            1,
            "access.old",
        );
        expect(hostedClient.getConduitsSnapshot).toHaveBeenNthCalledWith(
            2,
            "access.new",
        );
        await waitFor(() => {
            expect(contextValue!.state.session?.accessToken).toBe("access.new");
            expect(contextValue!.state.stationPhase).toBe("active");
        });
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
                    apiClient: hostedClient,
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

    it("persists the auth provider hint before hosted login completes", async () => {
        const signInDeferred =
            createDeferred<Awaited<ReturnType<HostedAuthService["signIn"]>>>();
        const session = makeSession({
            accessToken: "access.login",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
        });
        const authService = makeAuthService({
            signIn: jest.fn().mockReturnValue(signInDeferred.promise),
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(null),
            login: jest.fn().mockResolvedValue(session),
        });
        const hostedClient = makeHostedClient({
            getConduitsSnapshot: jest.fn().mockResolvedValue({
                entitlement: {
                    status: "inactive",
                    product_id: "test.product.primary",
                },
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
                    apiClient: hostedClient,
                    revenueCat: makeRevenueCatContext(),
                },
                <Consumer />,
            );
        });

        let signInPromise: Promise<void> | null = null;
        await act(async () => {
            signInPromise = contextValue!.signIn("google");
            await flushPromises();
        });

        await waitFor(() => {
            expect(contextValue!.lastAuthProvider).toBe("google");
        });
        await expect(
            SecureStore.getItemAsync(SECURESTORE_HOSTED_LAST_AUTH_PROVIDER_KEY),
        ).resolves.toContain('"provider":"google"');
        expect(sessionClient.login).not.toHaveBeenCalled();

        await act(async () => {
            signInDeferred.resolve({
                provider: "google",
                tokenType: "clerk_broker_jwt",
                brokerToken: "clerk.broker.jwt",
                platform: "android",
                clientVersion: "2.0.0",
            });
            await signInPromise!;
        });

        expect(sessionClient.login).toHaveBeenCalledWith({
            token_type: "clerk_broker_jwt",
            broker_token: "clerk.broker.jwt",
            platform: "android",
            client_version: "2.0.0",
        });
        await waitFor(() => {
            expect(contextValue!.state.authPhase).toBe("authenticated");
        });
    });

    it("rolls back the auth provider hint when sign-in fails", async () => {
        const authService = makeAuthService({
            signIn: jest.fn().mockRejectedValue(new Error("popup closed")),
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(null),
            login: jest.fn(),
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
                    apiClient: makeHostedClient(),
                    revenueCat: makeRevenueCatContext(),
                },
                <Consumer />,
            );
        });

        let signInError: unknown;
        await act(async () => {
            try {
                await contextValue!.signIn("google");
            } catch (error) {
                signInError = error;
            }
        });

        expect(signInError).toEqual(new Error("popup closed"));
        expect(sessionClient.login).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(contextValue!.lastAuthProvider).toBeNull();
        });
        await expect(
            SecureStore.getItemAsync(SECURESTORE_HOSTED_LAST_AUTH_PROVIDER_KEY),
        ).resolves.toBeNull();
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
                    apiClient: hostedClient,
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

    it("deletes the hosted account before clearing local session state", async () => {
        const existingSession = makeSession({
            accessToken: "access.delete",
            accessTokenExpiresAtMs: 90_000,
            refreshTokenExpiresAtMs: 1_000_000,
        });
        const authService = makeAuthService();
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(existingSession),
        });
        const hostedClient = makeHostedClient();

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
                    apiClient: hostedClient,
                    revenueCat: makeRevenueCatContext(),
                },
                <Consumer />,
            );
        });

        await waitFor(() => {
            expect(contextValue!.state.authPhase).toBe("authenticated");
        });

        await act(async () => {
            await contextValue!.deleteAccount();
        });

        expect(hostedClient.deleteAccount).toHaveBeenCalledWith(
            "access.delete",
        );
        expect(authService.signOut).toHaveBeenCalledTimes(1);
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
                    apiClient: hostedClient,
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
        await waitFor(() => {
            expect(getContextValue().state.revenuecatPhase).toBe("ready");
        });
    });

    it("clears restore pending for canceled but still allowed entitlements", async () => {
        const existingSession = makeSession({
            accessToken: "access.loaded",
            accessTokenExpiresAtMs: 1_000_000,
            refreshTokenExpiresAtMs: 2_000_000,
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(existingSession),
        });
        const hostedClient = makeHostedClient({
            getConduitsSnapshot: jest
                .fn()
                .mockResolvedValue(
                    makeConduitsSnapshot("canceled_not_expired"),
                ),
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
                    now: () => 10_000,
                    authService: makeAuthService(),
                    sessionClient,
                    apiClient: hostedClient,
                    revenueCat,
                },
                <Consumer />,
            );
        });

        await waitFor(() => {
            expect(contextValue!.state.authPhase).toBe("authenticated");
        });

        await act(async () => {
            await contextValue!.restorePurchases();
        });

        await waitFor(() => {
            expect(contextValue!.state.entitlementSnapshot).toBe(
                "canceled_not_expired",
            );
            expect(contextValue!.state.revenuecatPhase).toBe("ready");
        });
    });

    it("clears restore pending when restore starts from an already allowed entitlement", async () => {
        const existingSession = makeSession({
            accessToken: "access.loaded",
            accessTokenExpiresAtMs: 1_000_000,
            refreshTokenExpiresAtMs: 2_000_000,
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(existingSession),
        });
        const hostedClient = makeHostedClient({
            getConduitsSnapshot: jest
                .fn()
                .mockResolvedValue(
                    makeConduitsSnapshot("canceled_not_expired"),
                ),
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
                    now: () => 10_000,
                    authService: makeAuthService(),
                    sessionClient,
                    apiClient: hostedClient,
                    revenueCat,
                },
                <Consumer />,
            );
        });

        await waitFor(() => {
            expect(contextValue!.state.entitlementSnapshot).toBe(
                "canceled_not_expired",
            );
            expect(contextValue!.state.revenuecatPhase).toBe("ready");
        });

        await act(async () => {
            await contextValue!.restorePurchases();
        });

        await waitFor(() => {
            expect(contextValue!.state.entitlementSnapshot).toBe(
                "canceled_not_expired",
            );
            expect(contextValue!.state.revenuecatPhase).toBe("ready");
        });
    });

    it("clears restore pending when backend confirmation times out", async () => {
        const existingSession = makeSession({
            accessToken: "access.loaded",
            accessTokenExpiresAtMs: 1_000_000,
            refreshTokenExpiresAtMs: 2_000_000,
        });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(existingSession),
        });
        const hostedClient = makeHostedClient({
            getConduitsSnapshot: jest
                .fn()
                .mockResolvedValue(makeConduitsSnapshot("inactive")),
        });
        const revenueCat = makeRevenueCatContext();
        let shouldTimeoutPoll = false;
        let nowMs = 10_000;
        const now = jest.fn(() => {
            if (!shouldTimeoutPoll) {
                return nowMs;
            }

            nowMs += 26_000;
            return nowMs;
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
                    now,
                    authService: makeAuthService(),
                    sessionClient,
                    apiClient: hostedClient,
                    revenueCat,
                },
                <Consumer />,
            );
        });

        await waitFor(() => {
            expect(contextValue!.state.authPhase).toBe("authenticated");
        });

        shouldTimeoutPoll = true;
        await act(async () => {
            await contextValue!.restorePurchases();
        });

        await waitFor(() => {
            expect(contextValue!.state.revenuecatPhase).toBe("ready");
            expect(contextValue!.state.revenuecatError).toBe(
                "Purchase restored. Waiting for backend entitlement confirmation. Retry in a few moments.",
            );
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
                    apiClient: hostedClient,
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
                    apiClient: makeHostedClient(),
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
                    apiClient: hostedClient,
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
                    apiClient: hostedClient,
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
                    apiClient: hostedClient,
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
                    apiClient: hostedClient,
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
                    apiClient: hostedClient,
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
    ReturnType<typeof createHostedApiClient>,
    | "getAccountProfile"
    | "updateAccountProfile"
    | "deleteAccount"
    | "createBillingPortalSession"
    | "setPersonalCompartmentId"
    | "getConduitsSnapshot"
    | "getPlanCatalog"
    | "createStatsSession"
    | "getSummary"
    | "getRecent"
    | "getLive"
>;

function makeHostedClient(overrides?: Partial<HostedClient>): HostedClient {
    return {
        getAccountProfile: jest.fn().mockResolvedValue({
            alias: "Server Alias",
            alias_is_default: false,
            profile_version: 1,
        }),
        updateAccountProfile: jest.fn(),
        deleteAccount: jest.fn().mockResolvedValue(undefined),
        createBillingPortalSession: jest.fn().mockResolvedValue({
            url: "https://billing.revenuecat.com/app/sub?token=abc",
        }),
        setPersonalCompartmentId: jest
            .fn()
            .mockResolvedValue("jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g"),
        getConduitsSnapshot: jest.fn(),
        getPlanCatalog: jest.fn(),
        createStatsSession: jest.fn(),
        getSummary: jest.fn(),
        getRecent: jest.fn(),
        getLive: jest.fn(),
        ...overrides,
    };
}

function makeConduitsSnapshot(entitlementStatus: string): ConduitsSnapshot {
    return {
        entitlement: {
            status: entitlementStatus,
            product_id: "test.product.primary",
        },
        conduits: [
            {
                conduit_id: "cond_1",
                proxy_id: "st_1",
                status: "active",
            },
        ],
    };
}

function renderHostedExperience(
    providerProps: React.ComponentProps<typeof HostedExperienceProvider>,
    child: React.ReactNode,
): ReactTestRenderer {
    const queryClient = new QueryClient({
        defaultOptions: {
            // retryDelay: 0 keeps retrying queries (e.g. fetchQuery with
            // retry: 1) from parking real 1s timers that outlive the test
            // and keep the jest worker's event loop alive.
            queries: { retry: false, retryDelay: 0, gcTime: Infinity },
            mutations: { retry: false, retryDelay: 0, gcTime: Infinity },
        },
    });

    const renderer = create(
        <QueryClientProvider client={queryClient}>
            <HostedExperienceProvider delay={immediateDelay} {...providerProps}>
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

// The provider's activation-window poll sleeps on a real 1s setTimeout
// between iterations; resolve immediately in tests so no timer handle can
// outlive a test and keep the jest worker alive. Individual tests may still
// override this by passing their own `delay` in providerProps.
async function immediateDelay(): Promise<void> {
    await Promise.resolve();
}

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

function createDeferred<T>(): {
    promise: Promise<T>;
    resolve(value: T): void;
    reject(error: unknown): void;
} {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, resolve, reject };
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

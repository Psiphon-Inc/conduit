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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Network from "expo-network";
import React from "react";
import { PurchasesPackage } from "react-native-purchases";

import { timedLog } from "@/src/common/utils";
import {
    QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID,
    QUERYKEY_HOSTED_STATS_LIVE,
    QUERYKEY_HOSTED_STATS_RECENT,
    QUERYKEY_HOSTED_STATS_SUMMARY,
} from "@/src/constants";
import {
    updateHostedAccountAlias,
    useHostedAccountProfileQuery,
    useHostedUpdateAccountAliasMutation,
} from "@/src/hosted/accountQueries";
import { loadCachedAlias } from "@/src/hosted/aliasCache";
import {
    clearHostedLastAuthProvider,
    loadHostedLastAuthProvider,
    persistHostedLastAuthProvider,
} from "@/src/hosted/auth/persistence";
import { useOptionalHostedAuthService } from "@/src/hosted/auth/provider";
import { createStubHostedAuthService } from "@/src/hosted/auth/service";
import {
    HostedAuthService,
    HostedAuthSignInResult,
} from "@/src/hosted/auth/types";
import {
    HostedPersonalCompartmentIdConflictError,
    createHostedClient,
} from "@/src/hosted/client";
import {
    fetchHostedConduitsSnapshot,
    useHostedConduitsQuery,
} from "@/src/hosted/conduitQueries";
import {
    AccountProfile,
    OAuthProvider,
    PersonalCompartmentId,
} from "@/src/hosted/contracts";
import { selectHostedExperienceState } from "@/src/hosted/experience/selectors";
import {
    isEntitlementAllowed,
    normalizeHostedEntitlementStatus,
} from "@/src/hosted/experience/stateMachine";
import {
    HostedExperienceState,
    HostedRevenueCatPhase,
} from "@/src/hosted/experience/types";
import { hostedQueryKeys } from "@/src/hosted/queryKeys";
import { RevenueCatPublicKeys } from "@/src/hosted/revenuecatClient";
import {
    RevenueCatContextValue,
    useRevenueCatContext,
} from "@/src/hosted/revenuecatContext";
import {
    HostedSession,
    createHostedSessionClient,
} from "@/src/hosted/sessionClient";
import {
    HostedSessionDependencies,
    clearHostedSessionState,
    ensureHostedSession,
    setHostedSessionState,
    useHostedSessionQuery,
} from "@/src/hosted/sessionQueries";
import {
    loadAndroidPersonalCompartmentId,
    persistAndroidPersonalCompartmentId,
} from "@/src/personalCompartmentId";

type HostedSessionClient = ReturnType<typeof createHostedSessionClient>;
type HostedClient = ReturnType<typeof createHostedClient>;

export interface HostedExperienceActions {
    signIn(provider: OAuthProvider): Promise<void>;
    signOut(): Promise<void>;
    pollConduitsOnce(): Promise<void>;
    restorePurchases(): Promise<void>;
    purchasePackage(aPackage: PurchasesPackage): Promise<void>;
    refreshSessionIfNeeded(): Promise<HostedSession>;
    updateAccountAlias(alias: string): Promise<AccountProfile>;
}

export interface HostedExperienceContextValue extends HostedExperienceActions {
    state: HostedExperienceState;
    initialSessionResolved: boolean;
    hostedSnapshotBootstrapPending: boolean;
    lastAuthProvider: OAuthProvider | null;
}

export interface HostedExperienceProviderProps extends React.PropsWithChildren {
    baseUrl: string;
    revenueCatPublicKeys?: RevenueCatPublicKeys;
    revenueCatEntitlementIds?: string[];
    authService?: HostedAuthService;
    sessionClient?: HostedSessionClient;
    hostedClient?: HostedClient;
    revenueCat?: RevenueCatContextValue;
    now?: () => number;
}

interface HostedExperienceProviderInnerProps
    extends HostedExperienceProviderProps {
    revenueCat: RevenueCatContextValue;
}

const HostedExperienceContext =
    React.createContext<HostedExperienceContextValue | null>(null);

export function useHostedExperienceContext(): HostedExperienceContextValue {
    const value = React.useContext(HostedExperienceContext);
    if (!value) {
        throw new Error(
            "useHostedExperienceContext must be wrapped in a <HostedExperienceProvider />",
        );
    }
    return value;
}

export function HostedExperienceProvider(props: HostedExperienceProviderProps) {
    if (props.revenueCat) {
        return (
            <HostedExperienceProviderInner
                {...props}
                revenueCat={props.revenueCat}
            />
        );
    }
    return <HostedExperienceProviderWithRevenueCatContext {...props} />;
}

function HostedExperienceProviderWithRevenueCatContext(
    props: HostedExperienceProviderProps,
) {
    const revenueCat = useRevenueCatContext();
    return <HostedExperienceProviderInner {...props} revenueCat={revenueCat} />;
}

function HostedExperienceProviderInner(
    props: HostedExperienceProviderInnerProps,
) {
    const now = React.useMemo(
        () => props.now ?? (() => Date.now()),
        [props.now],
    );
    const baseUrl = React.useMemo(
        () => normalizeBaseUrl(props.baseUrl),
        [props.baseUrl],
    );
    const contextAuthService = useOptionalHostedAuthService();
    const queryClient = useQueryClient();
    const [revenuecatNotice, setRevenuecatNotice] = React.useState<
        string | null
    >(null);

    const authService = React.useMemo(
        () =>
            props.authService ??
            contextAuthService ??
            createStubHostedAuthService(),
        [contextAuthService, props.authService],
    );

    const sessionClient = React.useMemo(
        () =>
            props.sessionClient ??
            createHostedSessionClient({
                baseUrl,
            }),
        [baseUrl, props.sessionClient],
    );

    const hostedClient = React.useMemo(
        () =>
            props.hostedClient ??
            createHostedClient({
                baseUrl,
            }),
        [baseUrl, props.hostedClient],
    );

    const sessionDeps = React.useMemo<HostedSessionDependencies>(
        () => ({
            baseUrl,
            now,
            sessionClient,
        }),
        [baseUrl, now, sessionClient],
    );
    const sessionQuery = useHostedSessionQuery(sessionDeps);
    const networkState = Network.useNetworkState();
    const isOffline =
        networkState.isConnected === false ||
        networkState.isInternetReachable === false;
    const authProviderHintQuery = useQuery({
        queryKey: hostedQueryKeys.authProviderHint(baseUrl),
        enabled: Boolean(baseUrl),
        staleTime: Infinity,
        gcTime: Infinity,
        retry: false,
        queryFn: async () => loadHostedLastAuthProvider(baseUrl),
    });
    const accountProfileQuery = useHostedAccountProfileQuery({
        ...sessionDeps,
        hostedClient,
    });
    const conduitsQuery = useHostedConduitsQuery({
        ...sessionDeps,
        hostedClient,
        isOnline: isOffline ? false : true,
    });
    const updateAccountAliasMutation = useHostedUpdateAccountAliasMutation({
        ...sessionDeps,
        hostedClient,
    });

    const revenueCatBootstrapQuery = useQuery({
        queryKey: hostedQueryKeys.revenueCat(
            baseUrl,
            sessionQuery.data?.accountId ?? null,
        ),
        enabled: Boolean(baseUrl && sessionQuery.data?.accountId),
        retry: false,
        queryFn: async () => {
            const session = await ensureHostedSession(queryClient, sessionDeps);
            const configured = await configureRevenueCatForSession({
                revenueCat: props.revenueCat,
                accountId: session.accountId,
                revenueCatPublicKeys: props.revenueCatPublicKeys,
            });
            if (!configured) {
                return null;
            }
            return props.revenueCat.refreshCustomerInfo();
        },
    });

    const completeHostedAuth = React.useCallback(
        async (
            authResult: HostedAuthSignInResult,
            options: { persistAuthProviderHint: boolean },
        ) => {
            assertConfiguredBaseUrl(baseUrl);
            const session = await sessionClient.login({
                token_type: authResult.tokenType,
                broker_token: authResult.brokerToken,
                platform: authResult.platform,
                client_version: authResult.clientVersion,
            });

            const localAlias = await loadCachedAlias();

            await setHostedSessionState(queryClient, sessionDeps, session);

            queryClient.setQueryData(
                hostedQueryKeys.accountProfile(baseUrl, session.accountId),
                session.accountProfile ?? null,
            );

            if (session.accountProfile?.alias_is_default && localAlias !== "") {
                try {
                    await updateHostedAccountAlias(
                        queryClient,
                        {
                            ...sessionDeps,
                            hostedClient,
                        },
                        localAlias,
                    );
                } catch (error) {
                    timedLog(
                        `Hosted alias seed deferred: ${toErrorMessage(error)}`,
                    );
                }
            }

            if (authResult.platform === "android") {
                const personalCompartmentId =
                    await syncAndroidPersonalCompartmentId({
                        hostedClient,
                        accessToken: session.accessToken,
                    });
                queryClient.setQueryData(
                    [QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID],
                    personalCompartmentId,
                );
            }

            if (options.persistAuthProviderHint) {
                await persistHostedLastAuthProvider(
                    baseUrl,
                    authResult.provider,
                );
                queryClient.setQueryData(
                    hostedQueryKeys.authProviderHint(baseUrl),
                    authResult.provider,
                );
            }
            await queryClient.fetchQuery({
                queryKey: hostedQueryKeys.revenueCat(
                    baseUrl,
                    session.accountId,
                ),
                queryFn: async () => {
                    const configured = await configureRevenueCatForSession({
                        revenueCat: props.revenueCat,
                        accountId: session.accountId,
                        revenueCatPublicKeys: props.revenueCatPublicKeys,
                    });
                    if (!configured) {
                        return null;
                    }
                    return props.revenueCat.refreshCustomerInfo();
                },
            });
            await queryClient.fetchQuery({
                queryKey: hostedQueryKeys.conduits(baseUrl, session.accountId),
                retry: 1,
                queryFn: async () =>
                    fetchHostedConduitsSnapshot(queryClient, {
                        ...sessionDeps,
                        hostedClient,
                    }),
            });
        },
        [
            baseUrl,
            hostedClient,
            props.revenueCat,
            props.revenueCatPublicKeys,
            queryClient,
            sessionClient,
            sessionDeps,
        ],
    );

    const signInMutation = useMutation({
        mutationFn: async (provider: OAuthProvider) => {
            const authResult = await authService.signIn(provider);
            await completeHostedAuth(authResult, {
                persistAuthProviderHint: true,
            });
        },
        onMutate: () => {
            setRevenuecatNotice(null);
        },
    });
    const restoreSignInMutation = useMutation({
        mutationFn: async (provider: OAuthProvider) => {
            const authResult = await authService.restoreSignIn(provider);
            if (!authResult) {
                return null;
            }

            await completeHostedAuth(authResult, {
                persistAuthProviderHint: false,
            });
            return authResult;
        },
        onMutate: () => {
            setRevenuecatNotice(null);
        },
    });

    const [purchaseInflight, setPurchaseInflight] = React.useState(false);
    const purchaseMutation = useMutation({
        mutationFn: async (aPackage: PurchasesPackage) => {
            const purchaseResult =
                await props.revenueCat.purchasePackage(aPackage);
            const session = await ensureHostedSession(queryClient, sessionDeps);
            queryClient.setQueryData(
                hostedQueryKeys.revenueCat(baseUrl, session.accountId),
                purchaseResult.customerInfo,
            );
            await queryClient.fetchQuery({
                queryKey: hostedQueryKeys.conduits(baseUrl, session.accountId),
                retry: 1,
                queryFn: async () =>
                    fetchHostedConduitsSnapshot(queryClient, {
                        ...sessionDeps,
                        hostedClient,
                    }),
            });
            const confirmed = await pollConduitsDuringActivationWindow({
                queryClient,
                baseUrl,
                now,
                hostedClient,
                sessionDeps,
            });
            if (!confirmed) {
                setRevenuecatNotice(
                    "Purchase succeeded. Waiting for backend entitlement confirmation. Retry in a few moments.",
                );
            }
        },
        onMutate: () => {
            setPurchaseInflight(true);
            setRevenuecatNotice(null);
        },
        onError: () => {
            setPurchaseInflight(false);
        },
    });

    const [restoreInflight, setRestoreInflight] = React.useState(false);
    const restoreMutation = useMutation({
        mutationFn: async () => {
            const restoreResult = await props.revenueCat.restorePurchases();
            const session = await ensureHostedSession(queryClient, sessionDeps);
            queryClient.setQueryData(
                hostedQueryKeys.revenueCat(baseUrl, session.accountId),
                restoreResult.customerInfo,
            );

            // If the customer has no active entitlements after restore,
            // there is nothing to restore — fail immediately rather than
            // polling for 25 s and showing a hung loading screen (CON-19).
            const activeEntitlements = Object.keys(
                restoreResult.customerInfo.entitlements?.active ?? {},
            );
            if (activeEntitlements.length === 0) {
                throw new Error(
                    "No active purchases found to restore. Please subscribe to a plan first.",
                );
            }

            await queryClient.fetchQuery({
                queryKey: hostedQueryKeys.conduits(baseUrl, session.accountId),
                retry: 1,
                queryFn: async () =>
                    fetchHostedConduitsSnapshot(queryClient, {
                        ...sessionDeps,
                        hostedClient,
                    }),
            });
            const confirmed = await pollConduitsDuringActivationWindow({
                queryClient,
                baseUrl,
                now,
                hostedClient,
                sessionDeps,
            });
            if (!confirmed) {
                setRevenuecatNotice(
                    "Purchase restored. Waiting for backend entitlement confirmation. Retry in a few moments.",
                );
            }
        },
        onMutate: () => {
            setRestoreInflight(true);
            setRevenuecatNotice(null);
        },
        onError: () => {
            setRestoreInflight(false);
        },
    });

    const lastAuthProvider = authProviderHintQuery.data ?? null;
    const autoRestoreCandidate =
        baseUrl &&
        sessionQuery.isFetched &&
        authProviderHintQuery.isFetched &&
        !sessionQuery.data &&
        lastAuthProvider
            ? `${baseUrl}:${lastAuthProvider}:${sessionQuery.dataUpdatedAt}`
            : null;
    const lastAutoRestoreAttemptRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        if (!autoRestoreCandidate || !lastAuthProvider) {
            return;
        }
        if (signInMutation.isPending || restoreSignInMutation.isPending) {
            return;
        }
        if (lastAutoRestoreAttemptRef.current === autoRestoreCandidate) {
            return;
        }

        lastAutoRestoreAttemptRef.current = autoRestoreCandidate;
        restoreSignInMutation.mutate(lastAuthProvider);
    }, [
        autoRestoreCandidate,
        lastAuthProvider,
        restoreSignInMutation,
        signInMutation.isPending,
    ]);

    const initialSessionResolved =
        !baseUrl ||
        (sessionQuery.isFetched &&
            authProviderHintQuery.isFetched &&
            !restoreSignInMutation.isPending &&
            (autoRestoreCandidate == null ||
                lastAutoRestoreAttemptRef.current === autoRestoreCandidate));
    const accountProfile =
        accountProfileQuery.data ??
        conduitsQuery.data?.account ??
        sessionQuery.data?.accountProfile ??
        null;

    // Keep revenuecatPhase as "purchase_pending" / "restore_pending"
    // until the entitlement is actually confirmed, not just while the
    // mutation is running.  This prevents the home screen from flashing
    // stale UI (e.g. "Restore your Conduit") while the backend is still
    // processing the webhook after a successful purchase.
    const currentEntitlementStatus = normalizeHostedEntitlementStatus(
        conduitsQuery.data?.entitlement?.status ?? "",
    );
    const purchaseFullyConfirmed =
        currentEntitlementStatus === "active" ||
        currentEntitlementStatus === "grace";
    // Clear the inflight flags once the entitlement reaches its final
    // post-purchase state.  Using manual flags instead of
    // purchaseMutation.isSuccess avoids the stale-success problem where
    // a previous purchase keeps the phase stuck on "purchase_pending"
    // long after the entitlement has cycled back to a non-active state.
    React.useEffect(() => {
        if (purchaseFullyConfirmed) {
            setPurchaseInflight(false);
            setRestoreInflight(false);
        }
    }, [purchaseFullyConfirmed]);
    const revenuecatPhase: HostedRevenueCatPhase = !sessionQuery.data
        ? "uninitialized"
        : purchaseMutation.isPending || purchaseInflight
          ? "purchase_pending"
          : restoreMutation.isPending || restoreInflight
            ? "restore_pending"
            : revenueCatBootstrapQuery.isSuccess
              ? "ready"
              : revenueCatBootstrapQuery.isError ||
                  purchaseMutation.isError ||
                  restoreMutation.isError
                ? "error"
                : "uninitialized";
    const revenuecatError = revenuecatNotice
        ? revenuecatNotice
        : revenueCatBootstrapQuery.isError
          ? toErrorMessage(revenueCatBootstrapQuery.error)
          : purchaseMutation.isError
            ? toErrorMessage(purchaseMutation.error)
            : restoreMutation.isError
              ? toErrorMessage(restoreMutation.error)
              : null;

    const state = React.useMemo(
        () =>
            selectHostedExperienceState({
                session: sessionQuery.data ?? null,
                authPending:
                    signInMutation.isPending || restoreSignInMutation.isPending,
                authError:
                    !sessionQuery.data && signInMutation.isError
                        ? toErrorMessage(signInMutation.error)
                        : null,
                revenuecatPhase,
                revenuecatError,
                accountProfile,
                conduitsSnapshot: conduitsQuery.data ?? null,
                conduitsError: conduitsQuery.isError
                    ? toErrorMessage(conduitsQuery.error)
                    : null,
                conduitsUpdatedAtMs: conduitsQuery.dataUpdatedAt,
                lastUpdatedAtMs: [
                    sessionQuery.dataUpdatedAt,
                    accountProfileQuery.dataUpdatedAt,
                    conduitsQuery.dataUpdatedAt,
                    revenueCatBootstrapQuery.dataUpdatedAt,
                ].filter((value) => value > 0),
            }),
        [
            accountProfile,
            accountProfileQuery.dataUpdatedAt,
            conduitsQuery.data,
            conduitsQuery.dataUpdatedAt,
            conduitsQuery.error,
            conduitsQuery.isError,
            revenueCatBootstrapQuery.dataUpdatedAt,
            revenuecatError,
            revenuecatPhase,
            sessionQuery.data,
            sessionQuery.dataUpdatedAt,
            signInMutation.error,
            signInMutation.isError,
            signInMutation.isPending,
            restoreSignInMutation.isPending,
        ],
    );

    const hostedSnapshotBootstrapPending =
        Boolean(sessionQuery.data) &&
        !conduitsQuery.data &&
        !conduitsQuery.isError &&
        conduitsQuery.isFetching;

    const pollConduitsOnce = React.useCallback(async () => {
        const session = await ensureHostedSession(queryClient, sessionDeps);
        await queryClient.fetchQuery({
            queryKey: hostedQueryKeys.conduits(baseUrl, session.accountId),
            retry: 1,
            queryFn: async () =>
                fetchHostedConduitsSnapshot(queryClient, {
                    ...sessionDeps,
                    hostedClient,
                }),
        });
    }, [baseUrl, hostedClient, queryClient, sessionDeps]);

    const refreshSessionIfNeeded = React.useCallback(async () => {
        assertConfiguredBaseUrl(baseUrl);
        return ensureHostedSession(queryClient, sessionDeps);
    }, [baseUrl, queryClient, sessionDeps]);

    const signIn = React.useCallback(
        async (provider: OAuthProvider) => {
            await signInMutation.mutateAsync(provider);
        },
        [signInMutation],
    );

    const signOut = React.useCallback(async () => {
        signInMutation.reset();
        restoreSignInMutation.reset();
        purchaseMutation.reset();
        restoreMutation.reset();
        updateAccountAliasMutation.reset();
        setRevenuecatNotice(null);

        try {
            await authService.signOut();
        } catch {}

        await clearHostedLastAuthProvider();
        queryClient.setQueryData(
            hostedQueryKeys.authProviderHint(baseUrl),
            null,
        );
        await clearHostedSessionState(queryClient, sessionDeps);
        queryClient.removeQueries({ queryKey: hostedQueryKeys.root(baseUrl) });
        queryClient.removeQueries({
            queryKey: [QUERYKEY_HOSTED_STATS_SUMMARY],
        });
        queryClient.removeQueries({ queryKey: [QUERYKEY_HOSTED_STATS_RECENT] });
        queryClient.removeQueries({ queryKey: [QUERYKEY_HOSTED_STATS_LIVE] });
        queryClient.setQueryData(hostedQueryKeys.session(baseUrl), null);
    }, [
        baseUrl,
        purchaseMutation,
        queryClient,
        restoreMutation,
        restoreSignInMutation,
        sessionDeps,
        signInMutation,
        updateAccountAliasMutation,
        authService,
    ]);

    const value = React.useMemo<HostedExperienceContextValue>(
        () => ({
            state,
            initialSessionResolved,
            hostedSnapshotBootstrapPending,
            lastAuthProvider,
            signIn,
            signOut,
            pollConduitsOnce,
            restorePurchases: async () => restoreMutation.mutateAsync(),
            purchasePackage: async (aPackage) =>
                purchaseMutation.mutateAsync(aPackage),
            refreshSessionIfNeeded,
            updateAccountAlias: async (alias) =>
                updateAccountAliasMutation.mutateAsync(alias),
        }),
        [
            initialSessionResolved,
            hostedSnapshotBootstrapPending,
            lastAuthProvider,
            pollConduitsOnce,
            purchaseMutation,
            refreshSessionIfNeeded,
            restoreMutation,
            signIn,
            signOut,
            state,
            updateAccountAliasMutation,
        ],
    );

    return (
        <HostedExperienceContext.Provider value={value}>
            {props.children}
        </HostedExperienceContext.Provider>
    );
}

async function configureRevenueCatForSession(input: {
    revenueCat: RevenueCatContextValue;
    accountId: string;
    revenueCatPublicKeys?: RevenueCatPublicKeys;
}): Promise<boolean> {
    if (!input.revenueCatPublicKeys) {
        return false;
    }

    await input.revenueCat.initialize({
        publicKeys: input.revenueCatPublicKeys,
        accountId: input.accountId,
    });

    return true;
}

async function syncAndroidPersonalCompartmentId(input: {
    hostedClient: HostedClient;
    accessToken: string;
}): Promise<PersonalCompartmentId | null> {
    const localPersonalCompartmentId = await loadAndroidPersonalCompartmentId();
    if (!localPersonalCompartmentId) {
        return null;
    }

    try {
        const normalizedPersonalCompartmentId =
            await input.hostedClient.setPersonalCompartmentId(
                input.accessToken,
                localPersonalCompartmentId,
            );
        await persistAndroidPersonalCompartmentId(
            normalizedPersonalCompartmentId,
        );
        return normalizedPersonalCompartmentId;
    } catch (error) {
        if (error instanceof HostedPersonalCompartmentIdConflictError) {
            await persistAndroidPersonalCompartmentId(
                error.currentPersonalCompartmentId,
            );
            return error.currentPersonalCompartmentId;
        }

        timedLog(
            `Hosted personal compartment sync deferred: ${toErrorMessage(error)}`,
        );
        return localPersonalCompartmentId;
    }
}

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.trim().replace(/\/$/, "");
}

function assertConfiguredBaseUrl(baseUrl: string): void {
    if (!baseUrl) {
        throw new Error("Hosted experience base URL is not configured");
    }
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return "Unexpected error";
}

async function pollConduitsDuringActivationWindow(input: {
    queryClient: ReturnType<typeof useQueryClient>;
    baseUrl: string;
    now: () => number;
    hostedClient: HostedClient;
    sessionDeps: HostedSessionDependencies;
}): Promise<boolean> {
    const startedAtMs = input.now();
    const maxDurationMs = 25_000;
    const intervalMs = 1_000;

    while (input.now() - startedAtMs < maxDurationMs) {
        const session = await ensureHostedSession(
            input.queryClient,
            input.sessionDeps,
        );
        // Invalidate before fetching so we always hit the network and
        // never silently return the cached snapshot from the pre-poll
        // fetch that may still have the old entitlement status.
        const queryKey = hostedQueryKeys.conduits(
            input.baseUrl,
            session.accountId,
        );
        await input.queryClient.invalidateQueries({ queryKey });
        const snapshot = await input.queryClient.fetchQuery({
            queryKey,
            retry: 1,
            queryFn: async () =>
                fetchHostedConduitsSnapshot(input.queryClient, {
                    ...input.sessionDeps,
                    hostedClient: input.hostedClient,
                }),
        });
        if (
            isEntitlementAllowed(
                normalizeHostedEntitlementStatus(snapshot.entitlement.status),
            )
        ) {
            return true;
        }
        await delay(intervalMs);
    }

    return false;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

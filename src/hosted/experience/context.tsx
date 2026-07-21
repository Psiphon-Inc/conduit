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
import {
    QueryClient,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import * as Network from "expo-network";
import React from "react";

import { loadCachedAlias } from "@/src/common/conduitAlias";
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
import {
    HostedPersonalCompartmentIdConflictError,
    createHostedApiClient,
} from "@/src/hosted/apiClient";
import { HOSTED_SIGN_IN_METHOD_UNAVAILABLE_MESSAGE } from "@/src/hosted/auth/messages";
import {
    clearHostedLastAuthProvider,
    loadHostedLastAuthProvider,
    persistHostedLastAuthProvider,
} from "@/src/hosted/auth/persistence";
import { useOptionalHostedAuthService } from "@/src/hosted/auth/provider";
import {
    HostedAuthService,
    HostedAuthServiceError,
    HostedAuthSignInResult,
} from "@/src/hosted/auth/types";
import {
    fetchHostedConduitsSnapshot,
    useHostedConduitsQuery,
} from "@/src/hosted/conduitQueries";
import {
    AccountProfile,
    ConduitsSnapshot,
    OAuthProvider,
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
import { HostedEntitlementStatus } from "@/src/hosted/revenuecatEntitlements";
import {
    HostedCustomerInfo,
    HostedRevenueCatPackage,
} from "@/src/hosted/revenuecatTypes";
import {
    HostedSession,
    createHostedSessionClient,
} from "@/src/hosted/sessionClient";
import {
    HostedSessionDependencies,
    clearHostedSessionState,
    ensureHostedSession,
    refreshHostedSession,
    setHostedSessionState,
    useHostedSessionQuery,
    withHostedSessionRecovery,
} from "@/src/hosted/sessionQueries";
import { PersonalCompartmentId } from "@/src/pairing/compartmentId";
import {
    loadAndroidPersonalCompartmentId,
    persistAndroidPersonalCompartmentId,
} from "@/src/personalCompartmentId";

type HostedSessionClient = ReturnType<typeof createHostedSessionClient>;
type HostedApiClient = ReturnType<typeof createHostedApiClient>;

export interface HostedExperienceActions {
    signIn(provider: OAuthProvider): Promise<void>;
    startEmailCodeSignIn(email: string): Promise<void>;
    completeEmailCodeSignIn(code: string): Promise<void>;
    signOut(): Promise<void>;
    deleteAccount(): Promise<void>;
    pollConduitsOnce(): Promise<void>;
    refreshSessionIfNeeded(): Promise<HostedSession>;
    refreshSession(): Promise<HostedSession>;
    restorePurchases(): Promise<void>;
    purchasePackage(aPackage: HostedRevenueCatPackage): Promise<void>;
    updateAccountAlias(alias: string): Promise<AccountProfile>;
}

export interface HostedExperienceContextValue extends HostedExperienceActions {
    state: HostedExperienceState;
    initialSessionResolved: boolean;
    isOffline: boolean;
    hostedSnapshotBootstrapPending: boolean;
    revenueCatNativeActionPending: boolean;
    lastAuthProvider: OAuthProvider | null;
}

interface HostedExperienceProviderProps extends React.PropsWithChildren {
    baseUrl: string;
    revenueCatPublicKeys?: RevenueCatPublicKeys;
    revenueCatEntitlementIds?: string[];
    authService?: HostedAuthService;
    sessionClient?: HostedSessionClient;
    apiClient?: HostedApiClient;
    revenueCat?: RevenueCatContextValue;
    now?: () => number;
    delay?: (ms: number) => Promise<void>;
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
    // Dependency setup. Optional injections are retained as test seams.
    const now = React.useMemo(
        () => props.now ?? (() => Date.now()),
        [props.now],
    );
    const delay = React.useMemo(
        () => props.delay ?? defaultDelay,
        [props.delay],
    );
    const baseUrl = React.useMemo(
        () => normalizeBaseUrl(props.baseUrl),
        [props.baseUrl],
    );
    const contextAuthService = useOptionalHostedAuthService();
    const authService = props.authService ?? contextAuthService;
    if (!authService) {
        throw new Error(
            "HostedExperienceProvider requires an authService or a parent <HostedAuthProvider />",
        );
    }
    const queryClient = useQueryClient();
    const [revenuecatNotice, setRevenuecatNotice] = React.useState<
        string | null
    >(null);

    const sessionClient = React.useMemo(
        () =>
            props.sessionClient ??
            createHostedSessionClient({
                baseUrl,
            }),
        [baseUrl, props.sessionClient],
    );

    const apiClient = React.useMemo(
        () =>
            props.apiClient ??
            createHostedApiClient({
                baseUrl,
            }),
        [baseUrl, props.apiClient],
    );

    const sessionDeps = React.useMemo<HostedSessionDependencies>(
        () => ({
            baseUrl,
            now,
            sessionClient,
        }),
        [baseUrl, now, sessionClient],
    );

    // Queries.
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
        hostedClient: apiClient,
    });
    const conduitsQuery = useHostedConduitsQuery({
        ...sessionDeps,
        hostedClient: apiClient,
        isOnline: isOffline ? false : true,
    });
    const updateAccountAliasMutation = useHostedUpdateAccountAliasMutation({
        ...sessionDeps,
        hostedClient: apiClient,
    });
    const currentEntitlementStatus = normalizeHostedEntitlementStatus(
        conduitsQuery.data?.entitlement?.status ?? "",
    );
    const lastRevenuecatActionRef = React.useRef<"purchase" | "restore" | null>(
        null,
    );

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

    // Authentication.
    const rememberAuthProvider = React.useCallback(
        async (provider: OAuthProvider) => {
            setCachedAuthProviderHint(queryClient, baseUrl, provider);
            try {
                await persistHostedLastAuthProvider(baseUrl, provider);
            } catch (error) {
                timedLog(
                    `Hosted auth provider hint persistence deferred: ${toErrorMessage(error)}`,
                );
            }
        },
        [baseUrl, queryClient],
    );

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
                            hostedClient: apiClient,
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
                        apiClient,
                        queryClient,
                        sessionDeps,
                    });
                queryClient.setQueryData(
                    [QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID],
                    personalCompartmentId,
                );
            }

            if (options.persistAuthProviderHint) {
                await rememberAuthProvider(authResult.provider);
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
                        hostedClient: apiClient,
                    }),
            });
        },
        [
            baseUrl,
            apiClient,
            props.revenueCat,
            props.revenueCatPublicKeys,
            queryClient,
            rememberAuthProvider,
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
        onMutate: async (provider) => {
            const previousAuthProvider = authProviderHintQuery.data ?? null;
            setRevenuecatNotice(null);
            await rememberAuthProvider(provider);
            return { previousAuthProvider };
        },
        onError: async (_error, _provider, context) => {
            if (context?.previousAuthProvider) {
                await rememberAuthProvider(context.previousAuthProvider);
                return;
            }
            await clearHostedLastAuthProvider();
            setCachedAuthProviderHint(queryClient, baseUrl, null);
        },
    });
    const startEmailCodeSignInMutation = useMutation({
        mutationFn: async (email: string) => {
            if (!authService.startEmailCodeSignIn) {
                throw new HostedAuthServiceError({
                    code: "unavailable",
                    message: "Email-code sign-in is not available",
                    userMessage: HOSTED_SIGN_IN_METHOD_UNAVAILABLE_MESSAGE,
                });
            }
            await authService.startEmailCodeSignIn(email);
        },
        onMutate: () => {
            setRevenuecatNotice(null);
        },
    });
    const completeEmailCodeSignInMutation = useMutation({
        mutationFn: async (code: string) => {
            if (!authService.completeEmailCodeSignIn) {
                throw new HostedAuthServiceError({
                    code: "unavailable",
                    message: "Email-code sign-in is not available",
                    userMessage: HOSTED_SIGN_IN_METHOD_UNAVAILABLE_MESSAGE,
                });
            }
            const authResult = await authService.completeEmailCodeSignIn(code);
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

    // Billing activation.
    const [purchaseInflight, setPurchaseInflight] = React.useState(false);
    const [purchaseNeedsFreshEntitlement, setPurchaseNeedsFreshEntitlement] =
        React.useState(false);
    const [revenueCatNativeActionPending, setRevenueCatNativeActionPending] =
        React.useState(false);
    const purchaseMutation = useMutation({
        mutationFn: async (aPackage: HostedRevenueCatPackage) => {
            const previousEntitlementStatus = currentEntitlementStatus;
            let purchaseResult;
            setRevenueCatNativeActionPending(true);
            try {
                purchaseResult =
                    await props.revenueCat.purchasePackage(aPackage);
            } finally {
                setRevenueCatNativeActionPending(false);
            }
            const session = await ensureHostedSession(queryClient, sessionDeps);
            setCachedRevenueCatCustomerInfo(
                queryClient,
                baseUrl,
                session.accountId,
                purchaseResult.customerInfo,
            );
            await queryClient.fetchQuery({
                queryKey: hostedQueryKeys.conduits(baseUrl, session.accountId),
                retry: 1,
                queryFn: async () =>
                    fetchHostedConduitsSnapshot(queryClient, {
                        ...sessionDeps,
                        hostedClient: apiClient,
                    }),
            });
            const confirmed = await pollConduitsDuringActivationWindow({
                source: "purchase",
                previousEntitlementStatus,
                queryClient,
                baseUrl,
                now,
                delay,
                apiClient,
                sessionDeps,
            });
            if (!confirmed) {
                setPurchaseInflight(false);
                setPurchaseNeedsFreshEntitlement(false);
                setRevenuecatNotice(
                    "Purchase succeeded. Waiting for backend entitlement confirmation. Retry in a few moments.",
                );
            }
        },
        onMutate: () => {
            lastRevenuecatActionRef.current = "purchase";
            setPurchaseInflight(true);
            setPurchaseNeedsFreshEntitlement(
                currentEntitlementStatus === "canceled_not_expired",
            );
            setRevenuecatNotice(null);
        },
        onError: () => {
            setPurchaseInflight(false);
            setPurchaseNeedsFreshEntitlement(false);
        },
    });

    const [restoreInflight, setRestoreInflight] = React.useState(false);
    const restoreMutation = useMutation({
        mutationFn: async () => {
            let restoreResult;
            setRevenueCatNativeActionPending(true);
            try {
                restoreResult = await props.revenueCat.restorePurchases();
            } finally {
                setRevenueCatNativeActionPending(false);
            }
            const session = await ensureHostedSession(queryClient, sessionDeps);
            setCachedRevenueCatCustomerInfo(
                queryClient,
                baseUrl,
                session.accountId,
                restoreResult.customerInfo,
            );

            // If the customer has no active entitlements after restore,
            // fail immediately instead of polling through the activation window.
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
                        hostedClient: apiClient,
                    }),
            });
            const confirmed = await pollConduitsDuringActivationWindow({
                source: "restore",
                previousEntitlementStatus: currentEntitlementStatus,
                queryClient,
                baseUrl,
                now,
                delay,
                apiClient,
                sessionDeps,
            });
            if (!confirmed) {
                setRestoreInflight(false);
                setRevenuecatNotice(
                    "Purchase restored. Waiting for backend entitlement confirmation. Retry in a few moments.",
                );
            }
        },
        onMutate: () => {
            lastRevenuecatActionRef.current = "restore";
            setRestoreInflight(true);
            setRevenuecatNotice(null);
        },
        onError: () => {
            setRestoreInflight(false);
        },
    });

    // Derived state.
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
    const entitlementConfirmed = isEntitlementAllowed(currentEntitlementStatus);
    const purchaseFullyConfirmed =
        entitlementConfirmed &&
        (!purchaseNeedsFreshEntitlement ||
            currentEntitlementStatus !== "canceled_not_expired");
    // Clear the inflight flags once the entitlement reaches its final
    // post-purchase state.  Using manual flags instead of
    // purchaseMutation.isSuccess avoids the stale-success problem where
    // a previous purchase keeps the phase stuck on "purchase_pending"
    // long after the entitlement has cycled back to a non-active state.
    React.useEffect(() => {
        if (purchaseInflight && purchaseFullyConfirmed) {
            setPurchaseInflight(false);
            setPurchaseNeedsFreshEntitlement(false);
        }
        if (restoreInflight && entitlementConfirmed) {
            setRestoreInflight(false);
        }
    }, [
        entitlementConfirmed,
        purchaseFullyConfirmed,
        purchaseInflight,
        restoreInflight,
    ]);
    const revenuecatPhase = resolveRevenueCatPhase({
        hasSession: Boolean(sessionQuery.data),
        purchasePending: purchaseMutation.isPending || purchaseInflight,
        restorePending: restoreMutation.isPending || restoreInflight,
        bootstrapSucceeded: revenueCatBootstrapQuery.isSuccess,
        hasError:
            revenueCatBootstrapQuery.isError ||
            purchaseMutation.isError ||
            restoreMutation.isError,
    });
    const revenuecatError = resolveRevenueCatError({
        notice: revenuecatNotice,
        bootstrap: revenueCatBootstrapQuery,
        purchase: purchaseMutation,
        restore: restoreMutation,
        lastAction: lastRevenuecatActionRef.current,
    });
    const authError = resolveAuthError({
        hasSession: Boolean(sessionQuery.data),
        signIn: signInMutation,
        startEmailCodeSignIn: startEmailCodeSignInMutation,
        completeEmailCodeSignIn: completeEmailCodeSignInMutation,
    });

    const experienceState = React.useMemo(
        () =>
            selectHostedExperienceState({
                session: sessionQuery.data ?? null,
                authPending:
                    signInMutation.isPending ||
                    startEmailCodeSignInMutation.isPending ||
                    completeEmailCodeSignInMutation.isPending ||
                    restoreSignInMutation.isPending,
                authError,
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
            authError,
            conduitsQuery.data,
            conduitsQuery.dataUpdatedAt,
            conduitsQuery.error,
            conduitsQuery.isError,
            revenueCatBootstrapQuery.dataUpdatedAt,
            revenuecatError,
            revenuecatPhase,
            sessionQuery.data,
            sessionQuery.dataUpdatedAt,
            signInMutation.isPending,
            startEmailCodeSignInMutation.isPending,
            completeEmailCodeSignInMutation.isPending,
            restoreSignInMutation.isPending,
        ],
    );

    const hostedSnapshotBootstrapPending =
        Boolean(sessionQuery.data) &&
        !conduitsQuery.data &&
        !conduitsQuery.isError &&
        conduitsQuery.isFetching;

    // Actions.
    const pollConduitsOnce = React.useCallback(async () => {
        const session = await ensureHostedSession(queryClient, sessionDeps);
        await queryClient.fetchQuery({
            queryKey: hostedQueryKeys.conduits(baseUrl, session.accountId),
            retry: 1,
            queryFn: async () =>
                fetchHostedConduitsSnapshot(queryClient, {
                    ...sessionDeps,
                    hostedClient: apiClient,
                }),
        });
    }, [apiClient, baseUrl, queryClient, sessionDeps]);

    const refreshSessionIfNeeded = React.useCallback(async () => {
        assertConfiguredBaseUrl(baseUrl);
        return ensureHostedSession(queryClient, sessionDeps);
    }, [baseUrl, queryClient, sessionDeps]);

    const refreshSession = React.useCallback(async () => {
        assertConfiguredBaseUrl(baseUrl);
        return refreshHostedSession(queryClient, sessionDeps);
    }, [baseUrl, queryClient, sessionDeps]);

    const signIn = React.useCallback(
        async (provider: OAuthProvider) => {
            await signInMutation.mutateAsync(provider);
        },
        [signInMutation],
    );
    const startEmailCodeSignIn = React.useCallback(
        async (email: string) => {
            await startEmailCodeSignInMutation.mutateAsync(email);
        },
        [startEmailCodeSignInMutation],
    );
    const completeEmailCodeSignIn = React.useCallback(
        async (code: string) => {
            await completeEmailCodeSignInMutation.mutateAsync(code);
        },
        [completeEmailCodeSignInMutation],
    );

    const signOut = React.useCallback(async () => {
        signInMutation.reset();
        startEmailCodeSignInMutation.reset();
        completeEmailCodeSignInMutation.reset();
        restoreSignInMutation.reset();
        purchaseMutation.reset();
        restoreMutation.reset();
        updateAccountAliasMutation.reset();
        setRevenueCatNativeActionPending(false);
        setPurchaseInflight(false);
        setPurchaseNeedsFreshEntitlement(false);
        setRestoreInflight(false);
        setRevenuecatNotice(null);

        try {
            await authService.signOut();
        } catch {}

        await clearHostedLastAuthProvider();
        setCachedAuthProviderHint(queryClient, baseUrl, null);
        await clearHostedSessionState(queryClient, sessionDeps);
        clearHostedExperienceQueryCache(queryClient, baseUrl);
    }, [
        baseUrl,
        purchaseMutation,
        queryClient,
        restoreMutation,
        restoreSignInMutation,
        sessionDeps,
        signInMutation,
        startEmailCodeSignInMutation,
        completeEmailCodeSignInMutation,
        updateAccountAliasMutation,
        authService,
    ]);

    const deleteAccount = React.useCallback(async () => {
        const session = await ensureHostedSession(queryClient, sessionDeps);
        await apiClient.deleteAccount(session.accessToken);
        await signOut();
    }, [apiClient, queryClient, sessionDeps, signOut]);

    // Provider value.
    const value = React.useMemo<HostedExperienceContextValue>(
        () => ({
            state: experienceState,
            initialSessionResolved,
            isOffline,
            hostedSnapshotBootstrapPending,
            revenueCatNativeActionPending,
            lastAuthProvider,
            signIn,
            startEmailCodeSignIn,
            completeEmailCodeSignIn,
            signOut,
            deleteAccount,
            pollConduitsOnce,
            refreshSessionIfNeeded,
            refreshSession,
            restorePurchases: async () => restoreMutation.mutateAsync(),
            purchasePackage: async (aPackage) =>
                purchaseMutation.mutateAsync(aPackage),
            updateAccountAlias: async (alias) =>
                updateAccountAliasMutation.mutateAsync(alias),
        }),
        [
            initialSessionResolved,
            isOffline,
            deleteAccount,
            hostedSnapshotBootstrapPending,
            lastAuthProvider,
            pollConduitsOnce,
            purchaseMutation,
            revenueCatNativeActionPending,
            refreshSession,
            refreshSessionIfNeeded,
            restoreMutation,
            startEmailCodeSignIn,
            completeEmailCodeSignIn,
            signIn,
            signOut,
            experienceState,
            updateAccountAliasMutation,
        ],
    );

    return (
        <HostedExperienceContext.Provider value={value}>
            {props.children}
        </HostedExperienceContext.Provider>
    );
}

interface ErrorState {
    isError: boolean;
    error: unknown;
}

function resolveRevenueCatPhase(input: {
    hasSession: boolean;
    purchasePending: boolean;
    restorePending: boolean;
    bootstrapSucceeded: boolean;
    hasError: boolean;
}): HostedRevenueCatPhase {
    if (!input.hasSession) {
        return "uninitialized";
    }
    if (input.purchasePending) {
        return "purchase_pending";
    }
    if (input.restorePending) {
        return "restore_pending";
    }
    if (input.bootstrapSucceeded) {
        return "ready";
    }
    if (input.hasError) {
        return "error";
    }
    return "uninitialized";
}

function resolveRevenueCatError(input: {
    notice: string | null;
    bootstrap: ErrorState;
    purchase: ErrorState;
    restore: ErrorState;
    lastAction: "purchase" | "restore" | null;
}): string | null {
    if (input.notice) {
        return input.notice;
    }
    if (input.bootstrap.isError) {
        return toErrorMessage(input.bootstrap.error);
    }
    if (input.purchase.isError && input.lastAction === "purchase") {
        return toErrorMessage(input.purchase.error);
    }
    if (input.restore.isError && input.lastAction === "restore") {
        return toErrorMessage(input.restore.error);
    }
    return null;
}

function resolveAuthError(input: {
    hasSession: boolean;
    signIn: ErrorState;
    startEmailCodeSignIn: ErrorState;
    completeEmailCodeSignIn: ErrorState;
}): string | null {
    if (input.hasSession) {
        return null;
    }
    if (input.signIn.isError) {
        return toErrorMessage(input.signIn.error);
    }
    if (input.startEmailCodeSignIn.isError) {
        return toErrorMessage(input.startEmailCodeSignIn.error);
    }
    if (input.completeEmailCodeSignIn.isError) {
        return toErrorMessage(input.completeEmailCodeSignIn.error);
    }
    return null;
}

function setCachedRevenueCatCustomerInfo(
    queryClient: QueryClient,
    baseUrl: string,
    accountId: string,
    customerInfo: HostedCustomerInfo,
): void {
    queryClient.setQueryData(
        hostedQueryKeys.revenueCat(baseUrl, accountId),
        customerInfo,
    );
}

function setCachedAuthProviderHint(
    queryClient: QueryClient,
    baseUrl: string,
    provider: OAuthProvider | null,
): void {
    queryClient.setQueryData(
        hostedQueryKeys.authProviderHint(baseUrl),
        provider,
    );
}

function clearHostedExperienceQueryCache(
    queryClient: QueryClient,
    baseUrl: string,
): void {
    queryClient.removeQueries({ queryKey: hostedQueryKeys.root(baseUrl) });
    queryClient.removeQueries({ queryKey: [QUERYKEY_HOSTED_STATS_SUMMARY] });
    queryClient.removeQueries({ queryKey: [QUERYKEY_HOSTED_STATS_RECENT] });
    queryClient.removeQueries({ queryKey: [QUERYKEY_HOSTED_STATS_LIVE] });
    queryClient.setQueryData(hostedQueryKeys.session(baseUrl), null);
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
    apiClient: HostedApiClient;
    queryClient: QueryClient;
    sessionDeps: HostedSessionDependencies;
}): Promise<PersonalCompartmentId | null> {
    const localPersonalCompartmentId = await loadAndroidPersonalCompartmentId();
    if (!localPersonalCompartmentId) {
        return null;
    }

    try {
        const normalizedPersonalCompartmentId = await withHostedSessionRecovery(
            input.queryClient,
            input.sessionDeps,
            (session) =>
                input.apiClient.setPersonalCompartmentId(
                    session.accessToken,
                    localPersonalCompartmentId,
                ),
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
    source: "purchase" | "restore";
    previousEntitlementStatus: HostedEntitlementStatus;
    queryClient: ReturnType<typeof useQueryClient>;
    baseUrl: string;
    now: () => number;
    delay: (ms: number) => Promise<void>;
    apiClient: HostedApiClient;
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
        // Mark stale before fetching so we never return the pre-poll snapshot,
        // but do not refetch active observers here; fetchQuery below performs
        // the single activation poll request.
        const queryKey = hostedQueryKeys.conduits(
            input.baseUrl,
            session.accountId,
        );
        await input.queryClient.invalidateQueries({
            queryKey,
            refetchType: "none",
        });
        const snapshot = await input.queryClient.fetchQuery({
            queryKey,
            staleTime: 0,
            retry: 1,
            queryFn: async () =>
                fetchHostedConduitsSnapshot(input.queryClient, {
                    ...input.sessionDeps,
                    hostedClient: input.apiClient,
                }),
        });
        if (isActivationSnapshotConfirmed(input, snapshot)) {
            return true;
        }
        await input.delay(intervalMs);
    }

    return false;
}

function isActivationSnapshotConfirmed(
    input: {
        source: "purchase" | "restore";
        previousEntitlementStatus: HostedEntitlementStatus;
    },
    snapshot: ConduitsSnapshot,
): boolean {
    const entitlementStatus = normalizeHostedEntitlementStatus(
        snapshot.entitlement.status,
    );
    if (!isEntitlementAllowed(entitlementStatus)) {
        return false;
    }

    return !(
        input.source === "purchase" &&
        input.previousEntitlementStatus === "canceled_not_expired" &&
        entitlementStatus === "canceled_not_expired"
    );
}

function defaultDelay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

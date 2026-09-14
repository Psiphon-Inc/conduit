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
import { QueryClient } from "@tanstack/react-query";
import React from "react";
import { AppState, Platform } from "react-native";

import { timedLog } from "@/src/common/utils";
import { QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID } from "@/src/constants";
import {
    HostedPersonalCompartmentIdConflictError,
    createHostedApiClient,
} from "@/src/hosted/apiClient";
import { hostedQueryKeys } from "@/src/hosted/queryKeys";
import { HostedSession } from "@/src/hosted/sessionClient";
import {
    HostedSessionDependencies,
    withHostedSessionRecovery,
} from "@/src/hosted/sessionQueries";
import {
    loadAndroidPersonalCompartmentId,
    reconcileAndroidPersonalCompartmentId,
} from "@/src/personalCompartmentId";

interface CompartmentSyncScope {
    accountId: string;
    running: boolean;
    complete: boolean;
}

/** Reconciles once per hosted account session; failed bursts recover on reconnect/foreground. */
export function useHostedPersonalCompartmentSync(input: {
    queryClient: QueryClient;
    sessionDeps: HostedSessionDependencies;
    apiClient: ReturnType<typeof createHostedApiClient>;
    isOffline: boolean;
    delay: (ms: number) => Promise<void>;
}): () => void {
    const { queryClient, sessionDeps, apiClient, isOffline, delay } = input;
    const offline = React.useRef(isOffline);
    const recover = React.useRef(() => {});
    const stop = React.useRef(() => {});

    React.useEffect(() => {
        const wasOffline = offline.current;
        offline.current = isOffline;
        if (wasOffline && !isOffline) recover.current();
    }, [isOffline]);

    React.useEffect(() => {
        if (Platform.OS !== "android" || !sessionDeps.baseUrl) return;
        const sessionKey = hostedQueryKeys.session(sessionDeps.baseUrl);
        let accountId: string | null = null;
        let scope: CompartmentSyncScope | null = null;
        const currentSession = () =>
            queryClient.getQueryData<HostedSession | null>(sessionKey);

        async function run() {
            const attemptScope = scope;
            if (
                !attemptScope ||
                attemptScope.running ||
                attemptScope.complete ||
                offline.current
            )
                return;
            attemptScope.running = true;
            const isCurrent = () =>
                scope === attemptScope &&
                currentSession()?.accountId === attemptScope.accountId;
            try {
                for (const waitMs of [0, 1000, 4000]) {
                    if (!isCurrent() || offline.current) return;
                    if (waitMs) await delay(waitMs);
                    if (!isCurrent() || offline.current) return;
                    try {
                        const localId = await queryClient.fetchQuery({
                            queryKey: [
                                QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID,
                            ],
                            staleTime: Infinity,
                            queryFn: loadAndroidPersonalCompartmentId,
                        });
                        if (!isCurrent() || offline.current) return;
                        if (!localId) continue;
                        const canonicalId = await withHostedSessionRecovery(
                            queryClient,
                            sessionDeps,
                            async (session) => {
                                if (
                                    !isCurrent() ||
                                    session.accountId !== attemptScope.accountId
                                )
                                    return null;
                                try {
                                    return await apiClient.setPersonalCompartmentId(
                                        session.accessToken,
                                        localId,
                                    );
                                } catch (error) {
                                    // In particular, a stale 401 must not initiate token recovery.
                                    if (!isCurrent()) return null;
                                    if (
                                        error instanceof
                                        HostedPersonalCompartmentIdConflictError
                                    )
                                        return error.currentPersonalCompartmentId;
                                    throw error;
                                }
                            },
                        );
                        if (!canonicalId || !isCurrent()) return;
                        await queryClient.cancelQueries({
                            queryKey: [
                                QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID,
                            ],
                        });
                        const result =
                            await reconcileAndroidPersonalCompartmentId(
                                canonicalId,
                                isCurrent,
                            );
                        if (result === "stale" || !isCurrent()) return;
                        if (result === "unavailable") continue;
                        queryClient.setQueryData(
                            [QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID],
                            canonicalId,
                        );
                        attemptScope.complete = true;
                        return;
                    } catch {
                        // No API/error payloads: they can contain the private identity.
                        if (isCurrent())
                            timedLog(
                                "Hosted personal compartment sync deferred; retaining local identity",
                            );
                    }
                }
            } finally {
                attemptScope.running = false;
            }
        }

        // Observe transitions synchronously, not a render later. Token refreshes
        // keep the same scope; sign-out and account switches invalidate old work.
        function sessionChanged() {
            const nextAccountId = currentSession()?.accountId ?? null;
            if (nextAccountId === accountId) return;
            accountId = nextAccountId;
            scope = accountId
                ? { accountId, running: false, complete: false }
                : null;
            void run();
        }
        const unsubscribe = queryClient
            .getQueryCache()
            .subscribe(sessionChanged);
        recover.current = () => {
            void run();
        };
        stop.current = () => {
            scope = null;
        };
        let previousAppState = AppState.currentState;
        const subscription = AppState.addEventListener("change", (state) => {
            if (state === "active" && previousAppState !== "active") void run();
            previousAppState = state;
        });
        sessionChanged();
        return () => {
            scope = null;
            recover.current = () => {};
            stop.current = () => {};
            unsubscribe();
            subscription.remove();
        };
    }, [apiClient, delay, queryClient, sessionDeps]);

    return React.useCallback(() => stop.current(), []);
}

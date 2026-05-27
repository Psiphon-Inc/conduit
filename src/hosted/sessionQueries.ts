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
    UseQueryResult,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";

import { cacheHostedAlias } from "@/src/hosted/aliasCache";
import { HostedClientRequestError } from "@/src/hosted/client";
import {
    isHostedRefreshTokenExpired,
    shouldRefreshHostedSession,
} from "@/src/hosted/experience/stateMachine";
import { hostedQueryKeys } from "@/src/hosted/queryKeys";
import {
    HostedApiRequestError,
    HostedSession,
    createHostedSessionClient,
} from "@/src/hosted/sessionClient";

type HostedSessionClient = ReturnType<typeof createHostedSessionClient>;

export interface HostedSessionDependencies {
    baseUrl: string;
    now: () => number;
    sessionClient: HostedSessionClient;
}

export function useHostedSessionQuery(
    input: HostedSessionDependencies,
): UseQueryResult<HostedSession | null> {
    return useQuery({
        queryKey: hostedQueryKeys.session(input.baseUrl),
        enabled: Boolean(input.baseUrl),
        staleTime: Infinity,
        gcTime: Infinity,
        retry: false,
        queryFn: async () => loadPersistedHostedSession(input.sessionClient),
    });
}

export async function ensureHostedSession(
    queryClient: QueryClient,
    input: HostedSessionDependencies,
): Promise<HostedSession> {
    const queryKey = hostedQueryKeys.session(input.baseUrl);
    let currentSession = queryClient.getQueryData<HostedSession | null>(
        queryKey,
    );
    if (currentSession === undefined) {
        currentSession = await queryClient.fetchQuery({
            queryKey,
            staleTime: Infinity,
            gcTime: Infinity,
            queryFn: async () =>
                loadPersistedHostedSession(input.sessionClient),
        });
    }

    if (!currentSession) {
        throw new Error("Hosted session not found");
    }

    const nowMs = input.now();
    if (isHostedRefreshTokenExpired(currentSession, nowMs)) {
        await clearHostedSessionState(queryClient, input);
        throw new Error("Hosted session has expired; please sign in again");
    }

    if (!shouldRefreshHostedSession(currentSession, nowMs)) {
        return currentSession;
    }

    return refreshHostedSession(queryClient, input);
}

// Deduplicates concurrent refresh calls for the same queryClient+baseUrl so
// that parallel queries racing on an expiring token only trigger one network
// request. WeakMap keying avoids cross-test pollution.
const inflightRefreshes = new WeakMap<
    QueryClient,
    Map<string, Promise<HostedSession>>
>();

export async function refreshHostedSession(
    queryClient: QueryClient,
    input: HostedSessionDependencies,
): Promise<HostedSession> {
    let byUrl = inflightRefreshes.get(queryClient);
    if (!byUrl) {
        byUrl = new Map();
        inflightRefreshes.set(queryClient, byUrl);
    }

    const existing = byUrl.get(input.baseUrl);
    if (existing) return existing;

    const promise = (async () => {
        try {
            const refreshed = await input.sessionClient.refresh();
            await setHostedSessionState(queryClient, input, refreshed);
            return refreshed;
        } catch (error) {
            if (
                error instanceof HostedApiRequestError &&
                error.status === 401
            ) {
                await clearHostedSessionState(queryClient, input);
                throw new Error("Hosted session expired; please sign in again");
            }
            throw error;
        } finally {
            byUrl.delete(input.baseUrl);
        }
    })();

    byUrl.set(input.baseUrl, promise);
    return promise;
}

export async function withHostedSessionRecovery<T>(
    queryClient: QueryClient,
    input: HostedSessionDependencies,
    request: (session: HostedSession) => Promise<T>,
): Promise<T> {
    const session = await ensureHostedSession(queryClient, input);
    try {
        return await request(session);
    } catch (error) {
        if (!isHostedUnauthorizedError(error)) {
            throw error;
        }
        const refreshed = await refreshHostedSession(queryClient, input);
        return request(refreshed);
    }
}

export async function setHostedSessionState(
    queryClient: QueryClient,
    input: HostedSessionDependencies,
    session: HostedSession | null,
): Promise<void> {
    const queryKey = hostedQueryKeys.session(input.baseUrl);
    if (!session) {
        queryClient.setQueryData(queryKey, null);
        return;
    }

    let nextSession = session;
    // Profile/cache writes can race with token refreshes; keep the newest token.
    queryClient.setQueryData<HostedSession | null>(queryKey, (current) => {
        nextSession = mergeHostedSessionState(current, session);
        return nextSession;
    });

    await input.sessionClient.persistHostedSession(nextSession);
    if (nextSession.accountProfile) {
        await cacheHostedAlias(queryClient, nextSession.accountProfile);
        queryClient.setQueryData(
            hostedQueryKeys.accountProfile(
                input.baseUrl,
                nextSession.accountId,
            ),
            nextSession.accountProfile,
        );
    }
}

function isHostedUnauthorizedError(error: unknown): boolean {
    return error instanceof HostedClientRequestError && error.status === 401;
}

function mergeHostedSessionState(
    current: HostedSession | null | undefined,
    next: HostedSession,
): HostedSession {
    if (
        !current ||
        current.accountId !== next.accountId ||
        current.accessTokenExpiresAtMs <= next.accessTokenExpiresAtMs
    ) {
        return next;
    }

    return {
        ...current,
        accountProfile: next.accountProfile ?? current.accountProfile,
        personalPairingWrapperBaseUrl:
            next.personalPairingWrapperBaseUrl ??
            current.personalPairingWrapperBaseUrl,
    };
}

export async function clearHostedSessionState(
    queryClient: QueryClient,
    input: HostedSessionDependencies,
): Promise<void> {
    await input.sessionClient.clearHostedSession();
    queryClient.setQueryData(hostedQueryKeys.session(input.baseUrl), null);
}

export function useHostedSessionHelpers(input: HostedSessionDependencies) {
    const queryClient = useQueryClient();

    return {
        ensureSession: async () => ensureHostedSession(queryClient, input),
        clearSession: async () => clearHostedSessionState(queryClient, input),
        setSession: async (session: HostedSession | null) =>
            setHostedSessionState(queryClient, input, session),
    };
}

async function loadPersistedHostedSession(
    sessionClient: HostedSessionClient,
): Promise<HostedSession | null> {
    try {
        return await sessionClient.loadHostedSession();
    } catch {
        await sessionClient.clearHostedSession();
        return null;
    }
}

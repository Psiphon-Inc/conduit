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
    keepPreviousData,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";

import {
    HostedApiClientRequestError,
    createHostedApiClient,
} from "@/src/hosted/apiClient";
import { RecentWindow, SummaryWindow } from "@/src/hosted/contracts";
import {
    DashboardLiveData,
    DashboardRecentAggregate,
    DashboardRecentData,
    DashboardSummaryAggregate,
    DashboardSummaryData,
    aggregateDashboardRecents,
    aggregateDashboardSummaries,
    selectStatsTarget,
    toDashboardLiveData,
    toDashboardRecentData,
    toDashboardSummaryData,
} from "@/src/hosted/dashboard/transforms";
import { hostedQueryKeys } from "@/src/hosted/queryKeys";
import {
    HostedSessionDependencies,
    useHostedSessionQuery,
    withHostedSessionRecovery,
} from "@/src/hosted/sessionQueries";

type HostedClient = ReturnType<typeof createHostedApiClient>;

interface HostedStatsDependencies extends HostedSessionDependencies {
    hostedClient: HostedClient;
}

interface HostedStatsSessionData {
    statsToken: string;
    proxyId: string;
}

export function useHostedStatsSessionQuery(
    input: HostedStatsDependencies,
    enabled: boolean,
): UseQueryResult<HostedStatsSessionData | null> {
    const queryClient = useQueryClient();
    const sessionQuery = useHostedSessionQuery(input);

    return useQuery({
        queryKey: hostedQueryKeys.statsSession(
            input.baseUrl,
            sessionQuery.data?.accountId ?? null,
        ),
        enabled: Boolean(
            enabled && input.baseUrl && sessionQuery.data?.accountId,
        ),
        staleTime: 20_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        queryFn: async () => {
            try {
                return await createHostedStatsSessionData(
                    queryClient,
                    input,
                    null,
                );
            } catch (error) {
                if (
                    error instanceof HostedApiClientRequestError &&
                    error.code === "stats.no_authorized_targets"
                ) {
                    return null;
                }
                throw error;
            }
        },
    });
}

export function useHostedStatsSummaryQuery(
    input: HostedStatsDependencies,
    sessionData: HostedStatsSessionData | null | undefined,
    window: SummaryWindow,
    enabled: boolean,
): UseQueryResult<DashboardSummaryData | null> {
    const queryClient = useQueryClient();
    return useQuery({
        queryKey: hostedQueryKeys.statsSummary(
            sessionData?.statsToken ?? null,
            sessionData?.proxyId ?? null,
            window,
        ),
        enabled: Boolean(
            enabled && sessionData?.statsToken && sessionData.proxyId,
        ),
        ...hostedStatsDataQueryOptions(20_000),
        queryFn: async () => {
            if (!sessionData) {
                return null;
            }
            const response = await fetchStatsWithRecovery(
                queryClient,
                input,
                sessionData,
                (fresh) =>
                    input.hostedClient.getSummary(
                        fresh.statsToken,
                        window,
                        fresh.proxyId,
                    ),
            );
            return toDashboardSummaryData(response);
        },
    });
}

export function useHostedStatsRecentQuery(
    input: HostedStatsDependencies,
    sessionData: HostedStatsSessionData | null | undefined,
    window: RecentWindow,
    enabled: boolean,
    refetchInterval: number | false,
): UseQueryResult<DashboardRecentData | null> {
    const queryClient = useQueryClient();
    return useQuery({
        queryKey: hostedQueryKeys.statsRecent(
            sessionData?.statsToken ?? null,
            sessionData?.proxyId ?? null,
            window,
        ),
        enabled: Boolean(
            enabled && sessionData?.statsToken && sessionData.proxyId,
        ),
        ...hostedStatsDataQueryOptions(10_000, refetchInterval),
        queryFn: async () => {
            if (!sessionData) {
                return null;
            }
            const response = await fetchStatsWithRecovery(
                queryClient,
                input,
                sessionData,
                (fresh) =>
                    input.hostedClient.getRecent(
                        fresh.statsToken,
                        window,
                        fresh.proxyId,
                    ),
            );
            return toDashboardRecentData(response);
        },
    });
}

export function useHostedStatsLiveQuery(
    input: HostedStatsDependencies,
    sessionData: HostedStatsSessionData | null | undefined,
    enabled: boolean,
    refetchInterval: number | false,
): UseQueryResult<DashboardLiveData | null> {
    const queryClient = useQueryClient();
    return useQuery({
        queryKey: hostedQueryKeys.statsLive(
            sessionData?.statsToken ?? null,
            sessionData?.proxyId ?? null,
        ),
        enabled: Boolean(
            enabled && sessionData?.statsToken && sessionData.proxyId,
        ),
        ...hostedStatsDataQueryOptions(10_000, refetchInterval),
        queryFn: async () => {
            if (!sessionData) {
                return null;
            }
            const response = await fetchStatsWithRecovery(
                queryClient,
                input,
                sessionData,
                (fresh) =>
                    input.hostedClient.getLive(fresh.statsToken, fresh.proxyId),
            );
            return toDashboardLiveData(response);
        },
    });
}

export function useHostedHomeWidgetStats(
    input: HostedStatsDependencies,
    enabled: boolean,
    refetchInterval: number | false,
): {
    summary: DashboardSummaryAggregate | null;
    recent: DashboardRecentAggregate | null;
    isLoading: boolean;
    updatedAt: string | null;
    isSyncing: boolean;
    noAuthorizedTargets: boolean;
} {
    const statsSessionQuery = useHostedStatsSessionQuery(input, enabled);
    const summaryQuery = useHostedStatsSummaryQuery(
        input,
        statsSessionQuery.data,
        "30d",
        enabled,
    );
    const recentQuery = useHostedStatsRecentQuery(
        input,
        statsSessionQuery.data,
        "5m",
        enabled,
        refetchInterval,
    );

    return {
        summary: summaryQuery.data
            ? aggregateDashboardSummaries([summaryQuery.data])
            : null,
        recent: recentQuery.data
            ? aggregateDashboardRecents([recentQuery.data])
            : null,
        isLoading:
            statsSessionQuery.isLoading ||
            summaryQuery.isLoading ||
            (recentQuery.isFetching && !recentQuery.data),
        updatedAt:
            recentQuery.data?.generatedAt ??
            summaryQuery.data?.generatedAt ??
            null,
        isSyncing:
            Boolean(enabled) &&
            (summaryQuery.isFetching || recentQuery.isFetching),
        noAuthorizedTargets:
            statsSessionQuery.isSuccess && statsSessionQuery.data == null,
    };
}

function hostedStatsDataQueryOptions(
    staleTime: number,
    refetchInterval?: number | false,
): {
    staleTime: number;
    placeholderData: typeof keepPreviousData;
    retry: 1;
    refetchOnWindowFocus: false;
    refetchOnReconnect: true;
    refetchInterval?: number | false;
} {
    const options = {
        staleTime,
        placeholderData: keepPreviousData,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
    } as const;
    if (refetchInterval === undefined) {
        return options;
    }
    return { ...options, refetchInterval };
}

async function fetchStatsWithRecovery<T>(
    queryClient: QueryClient,
    input: HostedStatsDependencies,
    sessionData: HostedStatsSessionData,
    request: (session: HostedStatsSessionData) => Promise<T>,
): Promise<T> {
    try {
        return await request(sessionData);
    } catch (error) {
        if (
            error instanceof HostedApiClientRequestError &&
            error.status === 401
        ) {
            await queryClient.invalidateQueries({
                queryKey: hostedQueryKeys.statsSession(
                    input.baseUrl,
                    sessionQueryAccountId(queryClient, input.baseUrl),
                ),
            });
            const refreshedSession = await queryClient.fetchQuery({
                queryKey: hostedQueryKeys.statsSession(
                    input.baseUrl,
                    sessionQueryAccountId(queryClient, input.baseUrl),
                ),
                staleTime: 0,
                queryFn: async () =>
                    createHostedStatsSessionData(
                        queryClient,
                        input,
                        sessionData.proxyId,
                    ),
            });
            if (!refreshedSession) {
                throw error;
            }
            return request(refreshedSession);
        }
        throw error;
    }
}

async function createHostedStatsSessionData(
    queryClient: QueryClient,
    input: HostedStatsDependencies,
    previousProxyId: string | null,
): Promise<HostedStatsSessionData> {
    return withHostedSessionRecovery(queryClient, input, async (session) => {
        const statsSession = await input.hostedClient.createStatsSession(
            session.accessToken,
        );
        const hostedTargets = statsSession.targets.filter(
            (target) => target.source === "hosted",
        );
        const selection = selectStatsTarget({
            previousProxyId,
            targets:
                hostedTargets.length > 0 ? hostedTargets : statsSession.targets,
        });
        return {
            statsToken: statsSession.stats_token,
            proxyId: selection.selectedProxyId,
        };
    });
}

function sessionQueryAccountId(
    queryClient: QueryClient,
    baseUrl: string,
): string | null {
    return (
        queryClient.getQueryData<{ accountId: string } | null>(
            hostedQueryKeys.session(baseUrl),
        )?.accountId ?? null
    );
}

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
    HostedClientRequestError,
    createHostedClient,
} from "@/src/hosted/client";
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
} from "@/src/hosted/dashboard";
import { HostedStatsDataSource, hostedQueryKeys } from "@/src/hosted/queryKeys";
import {
    HostedSessionDependencies,
    ensureHostedSession,
    useHostedSessionQuery,
} from "@/src/hosted/sessionQueries";

type HostedClient = ReturnType<typeof createHostedClient>;

export interface HostedStatsDependencies extends HostedSessionDependencies {
    hostedClient: HostedClient;
    dataSource?: HostedStatsDataSource;
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
    const dataSource = input.dataSource ?? "api";

    return useQuery({
        queryKey: hostedQueryKeys.statsSession(
            input.baseUrl,
            sessionQuery.data?.accountId ?? null,
            dataSource,
        ),
        enabled:
            dataSource === "mock"
                ? enabled
                : Boolean(
                      enabled && input.baseUrl && sessionQuery.data?.accountId,
                  ),
        staleTime: 20_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        queryFn: async () => {
            if (dataSource === "mock") {
                return null;
            }
            const session = await ensureHostedSession(queryClient, input);
            try {
                const statsSession =
                    await input.hostedClient.createStatsSession(
                        session.accessToken,
                    );
                const hostedTargets = statsSession.targets.filter(
                    (target) => target.source === "hosted",
                );
                const selection = selectStatsTarget({
                    previousProxyId: null,
                    targets:
                        hostedTargets.length > 0
                            ? hostedTargets
                            : statsSession.targets,
                });
                return {
                    statsToken: statsSession.stats_token,
                    proxyId: selection.selectedProxyId,
                };
            } catch (error) {
                if (
                    error instanceof HostedClientRequestError &&
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
    queryFnOverride?: () => Promise<DashboardSummaryData | null>,
): UseQueryResult<DashboardSummaryData | null> {
    const queryClient = useQueryClient();
    const dataSource = input.dataSource ?? "api";
    return useQuery({
        queryKey: hostedQueryKeys.statsSummary(
            dataSource,
            sessionData?.statsToken ?? null,
            sessionData?.proxyId ?? null,
            window,
        ),
        enabled:
            dataSource === "mock"
                ? enabled
                : Boolean(
                      enabled && sessionData?.statsToken && sessionData.proxyId,
                  ),
        staleTime: 20_000,
        placeholderData: keepPreviousData,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        queryFn: async () => {
            if (queryFnOverride) {
                return queryFnOverride();
            }
            if (dataSource === "mock" || !sessionData) {
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
    queryFnOverride?: () => Promise<DashboardRecentData | null>,
): UseQueryResult<DashboardRecentData | null> {
    const queryClient = useQueryClient();
    const dataSource = input.dataSource ?? "api";
    return useQuery({
        queryKey: hostedQueryKeys.statsRecent(
            dataSource,
            sessionData?.statsToken ?? null,
            sessionData?.proxyId ?? null,
            window,
        ),
        enabled:
            dataSource === "mock"
                ? enabled
                : Boolean(
                      enabled && sessionData?.statsToken && sessionData.proxyId,
                  ),
        staleTime: 10_000,
        placeholderData: keepPreviousData,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchInterval,
        queryFn: async () => {
            if (queryFnOverride) {
                return queryFnOverride();
            }
            if (dataSource === "mock" || !sessionData) {
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
    queryFnOverride?: () => Promise<DashboardLiveData | null>,
): UseQueryResult<DashboardLiveData | null> {
    const queryClient = useQueryClient();
    const dataSource = input.dataSource ?? "api";
    return useQuery({
        queryKey: hostedQueryKeys.statsLive(
            dataSource,
            sessionData?.statsToken ?? null,
            sessionData?.proxyId ?? null,
        ),
        enabled:
            dataSource === "mock"
                ? enabled
                : Boolean(
                      enabled && sessionData?.statsToken && sessionData.proxyId,
                  ),
        staleTime: 10_000,
        placeholderData: keepPreviousData,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchInterval,
        queryFn: async () => {
            if (queryFnOverride) {
                return queryFnOverride();
            }
            if (dataSource === "mock" || !sessionData) {
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
            error instanceof HostedClientRequestError &&
            error.status === 401 &&
            input.dataSource !== "mock"
        ) {
            await queryClient.invalidateQueries({
                queryKey: hostedQueryKeys.statsSession(
                    input.baseUrl,
                    sessionQueryAccountId(queryClient, input.baseUrl),
                    input.dataSource,
                ),
            });
            const refreshedSession = await queryClient.fetchQuery({
                queryKey: hostedQueryKeys.statsSession(
                    input.baseUrl,
                    sessionQueryAccountId(queryClient, input.baseUrl),
                    input.dataSource,
                ),
                staleTime: 0,
                queryFn: async () => {
                    const accessSession = await ensureHostedSession(
                        queryClient,
                        input,
                    );
                    const statsSession =
                        await input.hostedClient.createStatsSession(
                            accessSession.accessToken,
                        );
                    const hostedTargets = statsSession.targets.filter(
                        (target) => target.source === "hosted",
                    );
                    const selection = selectStatsTarget({
                        previousProxyId: sessionData.proxyId,
                        targets:
                            hostedTargets.length > 0
                                ? hostedTargets
                                : statsSession.targets,
                    });
                    return {
                        statsToken: statsSession.stats_token,
                        proxyId: selection.selectedProxyId,
                    };
                },
            });
            if (!refreshedSession) {
                throw error;
            }
            return request(refreshedSession);
        }
        throw error;
    }
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

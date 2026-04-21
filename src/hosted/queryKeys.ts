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
    QUERYKEY_HOSTED_STATION,
    QUERYKEY_HOSTED_STATS_LIVE,
    QUERYKEY_HOSTED_STATS_RECENT,
    QUERYKEY_HOSTED_STATS_SUMMARY,
} from "@/src/constants";
import { RecentWindow, SummaryWindow } from "@/src/hosted/contracts";

export type HostedStatsDataSource = "api" | "mock";

export const hostedQueryKeys = {
    root: (baseUrl: string) => [QUERYKEY_HOSTED_STATION, baseUrl] as const,
    session: (baseUrl: string) =>
        [...hostedQueryKeys.root(baseUrl), "session"] as const,
    authProviderHint: (baseUrl: string) =>
        [...hostedQueryKeys.root(baseUrl), "auth-provider-hint"] as const,
    revenueCat: (baseUrl: string, accountId: string | null) =>
        [...hostedQueryKeys.root(baseUrl), "revenuecat", accountId] as const,
    accountProfile: (baseUrl: string, accountId: string | null) =>
        [
            ...hostedQueryKeys.root(baseUrl),
            "account-profile",
            accountId,
        ] as const,
    conduits: (baseUrl: string, accountId: string | null) =>
        [...hostedQueryKeys.root(baseUrl), "conduits", accountId] as const,
    statsSession: (
        baseUrl: string,
        accountId: string | null,
        dataSource: HostedStatsDataSource = "api",
    ) =>
        [
            ...hostedQueryKeys.root(baseUrl),
            "stats-session",
            dataSource,
            accountId,
        ] as const,
    statsSummary: (
        dataSource: HostedStatsDataSource,
        statsToken: string | null,
        proxyId: string | null,
        window: SummaryWindow,
    ) =>
        [
            QUERYKEY_HOSTED_STATS_SUMMARY,
            dataSource,
            statsToken,
            proxyId,
            window,
        ] as const,
    statsRecent: (
        dataSource: HostedStatsDataSource,
        statsToken: string | null,
        proxyId: string | null,
        window: RecentWindow,
    ) =>
        [
            QUERYKEY_HOSTED_STATS_RECENT,
            dataSource,
            statsToken,
            proxyId,
            window,
        ] as const,
    statsLive: (
        dataSource: HostedStatsDataSource,
        statsToken: string | null,
        proxyId: string | null,
    ) => [QUERYKEY_HOSTED_STATS_LIVE, dataSource, statsToken, proxyId] as const,
};

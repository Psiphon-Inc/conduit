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
import React from "react";

import { useAppIsActive } from "@/src/hooks";
import { createHostedApiClient } from "@/src/hosted/apiClient";
import { readHostedRuntimeConfig } from "@/src/hosted/config";
import { RecentWindow, SummaryWindow } from "@/src/hosted/contracts";
import { createHostedSessionClient } from "@/src/hosted/sessionClient";
import {
    useHostedStatsLiveQuery,
    useHostedStatsRecentQuery,
    useHostedStatsSessionQuery,
    useHostedStatsSummaryQuery,
} from "@/src/hosted/statsQueries";

export function useHostedDashboardStatsQueries(input: {
    enabled: boolean;
    isFocused: boolean;
    recentWindow: RecentWindow;
    summaryWindow: SummaryWindow;
    regionalBreakdownWindow: RecentWindow;
}) {
    const config = React.useMemo(readHostedRuntimeConfig, []);
    const hostedClient = React.useMemo(
        () => createHostedApiClient({ baseUrl: config.baseUrl }),
        [config.baseUrl],
    );
    const sessionClient = React.useMemo(
        () => createHostedSessionClient({ baseUrl: config.baseUrl }),
        [config.baseUrl],
    );
    const statsDeps = React.useMemo(
        () => ({
            baseUrl: config.baseUrl,
            now: () => Date.now(),
            sessionClient,
            hostedClient,
        }),
        [config.baseUrl, hostedClient, sessionClient],
    );
    const appIsActive = useAppIsActive();
    const shouldPoll = input.isFocused && appIsActive;
    const statsEnabled = input.enabled && Boolean(config.baseUrl);
    const statsSessionQuery = useHostedStatsSessionQuery(
        statsDeps,
        statsEnabled,
    );
    const summaryQuery = useHostedStatsSummaryQuery(
        statsDeps,
        statsSessionQuery.data,
        input.summaryWindow,
        statsEnabled,
    );
    const summaryThirtyDayQuery = useHostedStatsSummaryQuery(
        statsDeps,
        statsSessionQuery.data,
        "30d",
        statsEnabled,
    );
    const recentQuery = useHostedStatsRecentQuery(
        statsDeps,
        statsSessionQuery.data,
        input.recentWindow,
        statsEnabled,
        shouldPoll ? (input.recentWindow === "5m" ? 10_000 : 60_000) : false,
    );
    const regionalRecentQuery = useHostedStatsRecentQuery(
        statsDeps,
        statsSessionQuery.data,
        input.regionalBreakdownWindow,
        statsEnabled,
        shouldPoll
            ? input.regionalBreakdownWindow === "5m"
                ? 10_000
                : 60_000
            : false,
    );
    const liveQuery = useHostedStatsLiveQuery(
        statsDeps,
        statsSessionQuery.data,
        statsEnabled,
        shouldPoll ? 10_000 : false,
    );

    return {
        statsEnabled,
        shouldPoll,
        statsSessionQuery,
        summaryQuery,
        summaryThirtyDayQuery,
        recentQuery,
        regionalRecentQuery,
        liveQuery,
    };
}

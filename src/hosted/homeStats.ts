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
import {
    DashboardRecentAggregate,
    DashboardSummaryAggregate,
} from "@/src/hosted/dashboard/transforms";
import { createHostedSessionClient } from "@/src/hosted/sessionClient";
import { useHostedHomeWidgetStats } from "@/src/hosted/statsQueries";

export function useHostedHomeWidgetData(enabled: boolean): {
    summary: DashboardSummaryAggregate | null;
    recent: DashboardRecentAggregate | null;
    isLoading: boolean;
    updatedAt: string | null;
    isSyncing: boolean;
} {
    const config = React.useMemo(readHostedRuntimeConfig, []);
    const sessionClient = React.useMemo(
        () => createHostedSessionClient({ baseUrl: config.baseUrl }),
        [config.baseUrl],
    );
    const hostedClient = React.useMemo(
        () => createHostedApiClient({ baseUrl: config.baseUrl }),
        [config.baseUrl],
    );
    const appIsActive = useAppIsActive();

    const homeStatsQuery = useHostedHomeWidgetStats(
        {
            baseUrl: config.baseUrl,
            now: () => Date.now(),
            sessionClient,
            hostedClient,
        },
        enabled,
        appIsActive ? 10_000 : false,
    );

    return {
        summary: homeStatsQuery.summary,
        recent: homeStatsQuery.recent,
        isLoading: homeStatsQuery.isLoading,
        updatedAt: homeStatsQuery.updatedAt,
        isSyncing: appIsActive && homeStatsQuery.isSyncing,
    };
}

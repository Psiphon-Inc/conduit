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
import { act, create } from "react-test-renderer";

import { useAppIsActive } from "@/src/hooks";
import { createHostedApiClient } from "@/src/hosted/apiClient";
import { useHostedDashboardStatsQueries } from "@/src/hosted/dashboard/hooks";
import { createHostedSessionClient } from "@/src/hosted/sessionClient";
import {
    useHostedStatsLiveQuery,
    useHostedStatsRecentQuery,
    useHostedStatsSessionQuery,
    useHostedStatsSummaryQuery,
} from "@/src/hosted/statsQueries";

jest.mock("@/src/hooks", () => ({
    useAppIsActive: jest.fn(),
}));
jest.mock("@/src/hosted/apiClient", () => ({
    createHostedApiClient: jest.fn(),
}));
jest.mock("@/src/hosted/config", () => ({
    readHostedRuntimeConfig: jest.fn(() => ({
        baseUrl: "https://hosted.example.test",
    })),
}));
jest.mock("@/src/hosted/sessionClient", () => ({
    createHostedSessionClient: jest.fn(),
}));
jest.mock("@/src/hosted/statsQueries", () => ({
    useHostedStatsLiveQuery: jest.fn(),
    useHostedStatsRecentQuery: jest.fn(),
    useHostedStatsSessionQuery: jest.fn(),
    useHostedStatsSummaryQuery: jest.fn(),
}));

describe("useHostedDashboardStatsQueries", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (useAppIsActive as jest.Mock).mockReturnValue(true);
        (createHostedApiClient as jest.Mock).mockReturnValue({
            type: "hosted-client",
        });
        (createHostedSessionClient as jest.Mock).mockReturnValue({
            type: "session-client",
        });
        (useHostedStatsSessionQuery as jest.Mock).mockReturnValue({
            data: { statsToken: "stats-token", proxyId: "proxy-1" },
        });
        (useHostedStatsSummaryQuery as jest.Mock).mockReturnValue({});
        (useHostedStatsRecentQuery as jest.Mock).mockReturnValue({});
        (useHostedStatsLiveQuery as jest.Mock).mockReturnValue({});
    });

    it("composes all six queries with focus and foreground polling", () => {
        let result: ReturnType<typeof useHostedDashboardStatsQueries> | null =
            null;
        function Probe() {
            result = useHostedDashboardStatsQueries({
                enabled: true,
                isFocused: true,
                recentWindow: "5m",
                summaryWindow: "24h",
                regionalBreakdownWindow: "48h",
            });
            return null;
        }

        let renderer: ReturnType<typeof create>;
        act(() => {
            renderer = create(<Probe />);
        });

        const deps = expect.objectContaining({
            baseUrl: "https://hosted.example.test",
            hostedClient: { type: "hosted-client" },
            sessionClient: { type: "session-client" },
        });
        const session = { statsToken: "stats-token", proxyId: "proxy-1" };
        expect(useHostedStatsSessionQuery).toHaveBeenCalledWith(deps, true);
        expect(useHostedStatsSummaryQuery).toHaveBeenNthCalledWith(
            1,
            deps,
            session,
            "24h",
            true,
        );
        expect(useHostedStatsSummaryQuery).toHaveBeenNthCalledWith(
            2,
            deps,
            session,
            "30d",
            true,
        );
        expect(useHostedStatsRecentQuery).toHaveBeenNthCalledWith(
            1,
            deps,
            session,
            "5m",
            true,
            10_000,
        );
        expect(useHostedStatsRecentQuery).toHaveBeenNthCalledWith(
            2,
            deps,
            session,
            "48h",
            true,
            60_000,
        );
        expect(useHostedStatsLiveQuery).toHaveBeenCalledWith(
            deps,
            session,
            true,
            10_000,
        );
        expect(result).toMatchObject({
            statsEnabled: true,
            shouldPoll: true,
        });

        act(() => renderer!.unmount());
    });

    it("disables every polling interval while the app is inactive", () => {
        (useAppIsActive as jest.Mock).mockReturnValue(false);
        function Probe() {
            useHostedDashboardStatsQueries({
                enabled: true,
                isFocused: true,
                recentWindow: "5m",
                summaryWindow: "24h",
                regionalBreakdownWindow: "5m",
            });
            return null;
        }

        let renderer: ReturnType<typeof create>;
        act(() => {
            renderer = create(<Probe />);
        });

        expect(useHostedStatsRecentQuery).toHaveBeenNthCalledWith(
            1,
            expect.any(Object),
            expect.any(Object),
            "5m",
            true,
            false,
        );
        expect(useHostedStatsRecentQuery).toHaveBeenNthCalledWith(
            2,
            expect.any(Object),
            expect.any(Object),
            "5m",
            true,
            false,
        );
        expect(useHostedStatsLiveQuery).toHaveBeenCalledWith(
            expect.any(Object),
            expect.any(Object),
            true,
            false,
        );

        act(() => renderer!.unmount());
    });
});

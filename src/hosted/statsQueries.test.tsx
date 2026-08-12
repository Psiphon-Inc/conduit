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
    QueryClientProvider,
    keepPreviousData,
    useQuery,
} from "@tanstack/react-query";
import { ReactTestRenderer, act, create } from "react-test-renderer";

import {
    HostedApiClientRequestError,
    createHostedApiClient,
} from "@/src/hosted/apiClient";
import {
    HostedSession,
    createHostedSessionClient,
} from "@/src/hosted/sessionClient";
import {
    useHostedHomeWidgetStats,
    useHostedStatsLiveQuery,
    useHostedStatsRecentQuery,
    useHostedStatsSessionQuery,
    useHostedStatsSummaryQuery,
} from "@/src/hosted/statsQueries";

jest.mock("@tanstack/react-query", () => {
    const actual = jest.requireActual("@tanstack/react-query");
    return {
        ...actual,
        useQuery: jest.fn(actual.useQuery),
    };
});

const BASE_URL = "https://hcb.example.test";
const SESSION_KEY = ["hostedStation", BASE_URL, "session"];
const STATS_SESSION_KEY = [
    "hostedStation",
    BASE_URL,
    "stats-session",
    "api",
    "acc_123",
];

const SUMMARY_PAYLOAD = {
    window: "30d",
    generated_at: "2026-01-01T00:05:00.000Z",
    proxy_id: "st_1",
    segments: {
        personal: {
            active_users: 1,
            connecting_users: 2,
            bytes_up: 3,
            bytes_down: 4,
        },
        public: {
            active_users: 5,
            connecting_users: 6,
            bytes_up: 7,
            bytes_down: 8,
        },
    },
};

const RECENT_PAYLOAD = {
    window: "5m",
    bucket_seconds: 60,
    generated_at: "2026-01-01T00:05:00.000Z",
    proxy_id: "st_1",
    series: [
        {
            ts: "2026-01-01T00:05:00.000Z",
            personal_active_users: 3,
            public_active_users: 4,
            personal_connecting_users: 1,
            public_connecting_users: 2,
            public_bytes_transferred: 30,
            bytes_up: 10,
            bytes_down: 20,
        },
    ],
};

const LIVE_PAYLOAD = {
    generated_at: "2026-01-01T00:05:00.000Z",
    proxy_id: "st_1",
    announcing: 2,
    segments: {
        personal: {
            connected_users: 1,
            connecting_users: 2,
            bytes_up_total: 3,
            bytes_down_total: 4,
        },
        public: {
            connected_users: 5,
            connecting_users: 6,
            bytes_up_total: 7,
            bytes_down_total: 8,
        },
        total: {
            connected_users: 6,
            connecting_users: 8,
            bytes_up_total: 10,
            bytes_down_total: 12,
        },
    },
    personal_region_activity: [],
    public_region_activity: [],
};

describe("useHostedStatsSessionQuery", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        unmountAll();
        jest.useRealTimers();
    });

    it("creates a stats session preferring hosted targets under the account-scoped key", async () => {
        const hostedClient = makeHostedClient({
            createStatsSession: jest.fn().mockResolvedValue({
                stats_token: "stats.token.1",
                expires_in_seconds: 600,
                targets: [
                    { proxy_id: "local_1", source: "local" },
                    { proxy_id: "hosted_1", source: "hosted" },
                ],
            }),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const result = renderHook(queryClient, () =>
            useHostedStatsSessionQuery(makeInput({ hostedClient }), true),
        );
        await waitFor(() => {
            expect(result.current?.data).toEqual({
                statsToken: "stats.token.1",
                proxyId: "hosted_1",
            });
        });

        expect(hostedClient.createStatsSession).toHaveBeenCalledWith(
            "access.token",
        );
        expect(
            queryClient
                .getQueryCache()
                .getAll()
                .map((query) => query.queryKey),
        ).toContainEqual(STATS_SESSION_KEY);

        const options = findQueryOptions(
            (queryKey) => queryKey[2] === "stats-session",
        );
        expect(options.staleTime).toBe(20_000);
        expect(options.retry).toBe(1);
        expect(options.refetchOnWindowFocus).toBe(false);
        expect(options.refetchOnReconnect).toBe(true);
    });

    it("falls back to every returned target when none are hosted", async () => {
        const hostedClient = makeHostedClient({
            createStatsSession: jest.fn().mockResolvedValue({
                stats_token: "stats.token.1",
                expires_in_seconds: 600,
                targets: [
                    { proxy_id: "local_1", source: "local" },
                    { proxy_id: "local_2", source: "local_dev_assigned" },
                ],
            }),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const result = renderHook(queryClient, () =>
            useHostedStatsSessionQuery(makeInput({ hostedClient }), true),
        );
        await waitFor(() => {
            expect(result.current?.data).toEqual({
                statsToken: "stats.token.1",
                proxyId: "local_1",
            });
        });
    });

    it("stays idle until enabled and a hosted session account exists", async () => {
        const disabledClient = makeHostedClient();
        const disabledQueryClient = makeQueryClient();
        disabledQueryClient.setQueryData(SESSION_KEY, makeSession());
        const disabledResult = renderHook(disabledQueryClient, () =>
            useHostedStatsSessionQuery(
                makeInput({ hostedClient: disabledClient }),
                false,
            ),
        );
        await flushPromises();
        expect(disabledClient.createStatsSession).not.toHaveBeenCalled();
        expect(disabledResult.current?.fetchStatus).toBe("idle");

        const noSessionClient = makeHostedClient();
        const noSessionQueryClient = makeQueryClient();
        noSessionQueryClient.setQueryData(SESSION_KEY, null);
        renderHook(noSessionQueryClient, () =>
            useHostedStatsSessionQuery(
                makeInput({ hostedClient: noSessionClient }),
                true,
            ),
        );
        await flushPromises();
        expect(noSessionClient.createStatsSession).not.toHaveBeenCalled();
        expect(
            noSessionQueryClient
                .getQueryCache()
                .getAll()
                .map((query) => query.queryKey),
        ).toContainEqual([
            "hostedStation",
            BASE_URL,
            "stats-session",
            "api",
            null,
        ]);
    });

    it("resolves null when the account has no authorized stats targets", async () => {
        const hostedClient = makeHostedClient({
            createStatsSession: jest
                .fn()
                .mockRejectedValue(
                    new HostedApiClientRequestError(
                        "no targets",
                        403,
                        "stats.no_authorized_targets",
                    ),
                ),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const result = renderHook(queryClient, () =>
            useHostedStatsSessionQuery(makeInput({ hostedClient }), true),
        );
        await waitFor(() => {
            expect(result.current?.isSuccess).toBe(true);
        });
        expect(result.current?.data).toBeNull();
    });

    it("retries once and then surfaces stats session failures", async () => {
        jest.useFakeTimers();
        const sessionError = new Error("stats backend down");
        const hostedClient = makeHostedClient({
            createStatsSession: jest.fn().mockRejectedValue(sessionError),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const result = renderHook(queryClient, () =>
            useHostedStatsSessionQuery(makeInput({ hostedClient }), true),
        );
        await act(async () => {
            await jest.advanceTimersByTimeAsync(5_000);
        });

        // retry: 1 => the initial attempt plus exactly one retry.
        expect(hostedClient.createStatsSession).toHaveBeenCalledTimes(2);
        expect(result.current?.isError).toBe(true);
        expect(result.current?.error).toBe(sessionError);
    });
});

describe("useHostedStatsSummaryQuery", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        unmountAll();
        jest.useRealTimers();
    });

    it("fetches and transforms the summary for the session target", async () => {
        const hostedClient = makeHostedClient({
            getSummary: jest.fn().mockResolvedValue(SUMMARY_PAYLOAD),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const result = renderHook(queryClient, () =>
            useHostedStatsSummaryQuery(
                makeInput({ hostedClient }),
                { statsToken: "stats.token.1", proxyId: "st_1" },
                "30d",
                true,
            ),
        );
        await waitFor(() => {
            expect(result.current?.isSuccess).toBe(true);
        });

        expect(hostedClient.getSummary).toHaveBeenCalledWith(
            "stats.token.1",
            "30d",
            "st_1",
        );
        expect(result.current?.data).toMatchObject({
            window: "30d",
            generatedAt: "2026-01-01T00:05:00.000Z",
            stationId: "st_1",
            cards: [
                {
                    segment: "personal",
                    activeUsers: 1,
                    connectingUsers: 2,
                    bytesUp: 3,
                    bytesDown: 4,
                },
                {
                    segment: "public",
                    activeUsers: 5,
                    connectingUsers: 6,
                    bytesUp: 7,
                    bytesDown: 8,
                },
            ],
        });
        expect(
            queryClient
                .getQueryCache()
                .getAll()
                .map((query) => query.queryKey),
        ).toContainEqual([
            "hostedStatsSummary",
            "api",
            "stats.token.1",
            "st_1",
            "30d",
        ]);

        const options = findQueryOptions(
            (queryKey) => queryKey[0] === "hostedStatsSummary",
        );
        expect(options.staleTime).toBe(20_000);
        expect(options.retry).toBe(1);
        expect(options.refetchOnWindowFocus).toBe(false);
        expect(options.refetchOnReconnect).toBe(true);
        expect(options.placeholderData).toBe(keepPreviousData);
    });

    it("is gated on session data and the enabled flag", async () => {
        const hostedClient = makeHostedClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const result = renderHook(queryClient, () =>
            useHostedStatsSummaryQuery(
                makeInput({ hostedClient }),
                undefined,
                "30d",
                true,
            ),
        );
        await flushPromises();
        expect(hostedClient.getSummary).not.toHaveBeenCalled();
        expect(result.current?.fetchStatus).toBe("idle");
        expect(
            queryClient
                .getQueryCache()
                .getAll()
                .map((query) => query.queryKey),
        ).toContainEqual(["hostedStatsSummary", "api", null, null, "30d"]);

        const disabledClient = makeHostedClient();
        const disabledQueryClient = makeQueryClient();
        disabledQueryClient.setQueryData(SESSION_KEY, makeSession());
        renderHook(disabledQueryClient, () =>
            useHostedStatsSummaryQuery(
                makeInput({ hostedClient: disabledClient }),
                { statsToken: "stats.token.1", proxyId: "st_1" },
                "30d",
                false,
            ),
        );
        await flushPromises();
        expect(disabledClient.getSummary).not.toHaveBeenCalled();
    });

    it("recovers a 401 by minting a fresh stats session and retrying", async () => {
        const hostedClient = makeHostedClient({
            createStatsSession: jest.fn().mockResolvedValue({
                stats_token: "stats.token.new",
                expires_in_seconds: 600,
                targets: [
                    { proxy_id: "st_0", source: "hosted" },
                    { proxy_id: "st_1", source: "hosted" },
                ],
            }),
            getSummary: jest
                .fn()
                .mockRejectedValueOnce(
                    new HostedApiClientRequestError("stats token expired", 401),
                )
                .mockResolvedValueOnce(SUMMARY_PAYLOAD),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const result = renderHook(queryClient, () =>
            useHostedStatsSummaryQuery(
                makeInput({ hostedClient }),
                { statsToken: "stats.token.old", proxyId: "st_1" },
                "30d",
                true,
            ),
        );
        await waitFor(() => {
            expect(result.current?.isSuccess).toBe(true);
        });

        expect(hostedClient.getSummary).toHaveBeenNthCalledWith(
            1,
            "stats.token.old",
            "30d",
            "st_1",
        );
        // The previous proxy id is preserved through the re-minted session.
        expect(hostedClient.getSummary).toHaveBeenNthCalledWith(
            2,
            "stats.token.new",
            "30d",
            "st_1",
        );
        expect(hostedClient.createStatsSession).toHaveBeenCalledTimes(1);
        expect(queryClient.getQueryData(STATS_SESSION_KEY)).toEqual({
            statsToken: "stats.token.new",
            proxyId: "st_1",
        });
    });

    it("propagates non-401 summary errors without re-minting the session", async () => {
        jest.useFakeTimers();
        const summaryError = new HostedApiClientRequestError("stats down", 503);
        const hostedClient = makeHostedClient({
            getSummary: jest.fn().mockRejectedValue(summaryError),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const result = renderHook(queryClient, () =>
            useHostedStatsSummaryQuery(
                makeInput({ hostedClient }),
                { statsToken: "stats.token.1", proxyId: "st_1" },
                "30d",
                true,
            ),
        );
        await act(async () => {
            await jest.advanceTimersByTimeAsync(5_000);
        });

        expect(result.current?.isError).toBe(true);
        expect(result.current?.error).toBe(summaryError);
        expect(hostedClient.getSummary).toHaveBeenCalledTimes(2);
        expect(hostedClient.createStatsSession).not.toHaveBeenCalled();
    });
});

describe("useHostedStatsRecentQuery", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(unmountAll);

    it("fetches recent stats with a window-scoped key and zero-padded series", async () => {
        const hostedClient = makeHostedClient({
            getRecent: jest.fn().mockResolvedValue(RECENT_PAYLOAD),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const result = renderHook(queryClient, () =>
            useHostedStatsRecentQuery(
                makeInput({ hostedClient }),
                { statsToken: "stats.token.1", proxyId: "st_1" },
                "5m",
                true,
                15_000,
            ),
        );
        await waitFor(() => {
            expect(result.current?.isSuccess).toBe(true);
        });

        expect(hostedClient.getRecent).toHaveBeenCalledWith(
            "stats.token.1",
            "5m",
            "st_1",
        );
        expect(
            queryClient
                .getQueryCache()
                .getAll()
                .map((query) => query.queryKey),
        ).toContainEqual([
            "hostedStatsRecent",
            "api",
            "stats.token.1",
            "st_1",
            "5m",
        ]);

        const data = result.current?.data;
        expect(data).toMatchObject({
            window: "5m",
            bucketSeconds: 60,
            generatedAt: "2026-01-01T00:05:00.000Z",
            stationId: "st_1",
        });
        // 5m window at 60s buckets: 5 points; 4 padded zeros then the sample.
        expect(data?.series).toHaveLength(5);
        expect(data?.series.slice(0, 4).every((point) => point.isPadded)).toBe(
            true,
        );
        expect(data?.series[4]).toEqual({
            ts: "2026-01-01T00:05:00.000Z",
            personalActiveUsers: 3,
            publicActiveUsers: 4,
            personalConnectingUsers: 1,
            publicConnectingUsers: 2,
            personalBytesTransferred: 0,
            publicBytesTransferred: 30,
            bytesUp: 10,
            bytesDown: 20,
        });

        const options = findQueryOptions(
            (queryKey) => queryKey[0] === "hostedStatsRecent",
        );
        expect(options.staleTime).toBe(10_000);
        expect(options.retry).toBe(1);
        expect(options.refetchOnWindowFocus).toBe(false);
        expect(options.refetchOnReconnect).toBe(true);
        expect(options.refetchInterval).toBe(15_000);
        expect(options.placeholderData).toBe(keepPreviousData);
    });

    it("disables polling when the caller passes false", async () => {
        const hostedClient = makeHostedClient({
            getRecent: jest.fn().mockResolvedValue(RECENT_PAYLOAD),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        renderHook(queryClient, () =>
            useHostedStatsRecentQuery(
                makeInput({ hostedClient }),
                { statsToken: "stats.token.1", proxyId: "st_1" },
                "5m",
                true,
                false,
            ),
        );
        await flushPromises();

        const options = findQueryOptions(
            (queryKey) => queryKey[0] === "hostedStatsRecent",
        );
        expect(options.refetchInterval).toBe(false);
    });
});

describe("useHostedStatsLiveQuery", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(unmountAll);

    it("fetches live stats keyed by token and proxy", async () => {
        const hostedClient = makeHostedClient({
            getLive: jest.fn().mockResolvedValue(LIVE_PAYLOAD),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const result = renderHook(queryClient, () =>
            useHostedStatsLiveQuery(
                makeInput({ hostedClient }),
                { statsToken: "stats.token.1", proxyId: "st_1" },
                true,
                20_000,
            ),
        );
        await waitFor(() => {
            expect(result.current?.isSuccess).toBe(true);
        });

        expect(hostedClient.getLive).toHaveBeenCalledWith(
            "stats.token.1",
            "st_1",
        );
        expect(
            queryClient
                .getQueryCache()
                .getAll()
                .map((query) => query.queryKey),
        ).toContainEqual(["hostedStatsLive", "api", "stats.token.1", "st_1"]);
        expect(result.current?.data).toMatchObject({
            generatedAt: "2026-01-01T00:05:00.000Z",
            stationId: "st_1",
            announcing: 2,
            segments: {
                total: {
                    connectedUsers: 6,
                    connectingUsers: 8,
                    bytesUpTotal: 10,
                    bytesDownTotal: 12,
                },
            },
        });

        const options = findQueryOptions(
            (queryKey) => queryKey[0] === "hostedStatsLive",
        );
        expect(options.staleTime).toBe(10_000);
        expect(options.retry).toBe(1);
        expect(options.refetchOnWindowFocus).toBe(false);
        expect(options.refetchOnReconnect).toBe(true);
        expect(options.refetchInterval).toBe(20_000);
        expect(options.placeholderData).toBe(keepPreviousData);
    });

    it("is gated on session data", async () => {
        const hostedClient = makeHostedClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const result = renderHook(queryClient, () =>
            useHostedStatsLiveQuery(
                makeInput({ hostedClient }),
                null,
                true,
                false,
            ),
        );
        await flushPromises();

        expect(hostedClient.getLive).not.toHaveBeenCalled();
        expect(result.current?.fetchStatus).toBe("idle");
        expect(
            queryClient
                .getQueryCache()
                .getAll()
                .map((query) => query.queryKey),
        ).toContainEqual(["hostedStatsLive", "api", null, null]);
    });
});

describe("useHostedHomeWidgetStats", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(unmountAll);

    it("aggregates the 30d summary and 5m recent stats for the home widget", async () => {
        const hostedClient = makeHostedClient({
            createStatsSession: jest.fn().mockResolvedValue({
                stats_token: "stats.token.1",
                expires_in_seconds: 600,
                targets: [{ proxy_id: "st_1", source: "hosted" }],
            }),
            getSummary: jest.fn().mockResolvedValue(SUMMARY_PAYLOAD),
            getRecent: jest.fn().mockResolvedValue(RECENT_PAYLOAD),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const result = renderHook(queryClient, () =>
            useHostedHomeWidgetStats(makeInput({ hostedClient }), true, 30_000),
        );
        await waitFor(() => {
            expect(result.current?.summary).not.toBeNull();
            expect(result.current?.recent).not.toBeNull();
        });

        expect(hostedClient.getSummary).toHaveBeenCalledWith(
            "stats.token.1",
            "30d",
            "st_1",
        );
        expect(hostedClient.getRecent).toHaveBeenCalledWith(
            "stats.token.1",
            "5m",
            "st_1",
        );
        expect(result.current?.summary).toEqual({
            personal: {
                connectedUsers: 1,
                connectingUsers: 2,
                bytesTransferred: 7,
            },
            public: {
                connectedUsers: 5,
                connectingUsers: 6,
                bytesTransferred: 15,
            },
            total: {
                connectedUsers: 6,
                connectingUsers: 8,
                bytesTransferred: 22,
            },
        });
        expect(result.current?.recent).toEqual({
            personalActiveUsers: 3,
            publicActiveUsers: 4,
            personalConnectingUsers: 1,
            publicConnectingUsers: 2,
            personalBytesTransferred: 0,
            publicBytesTransferred: 30,
        });
        expect(result.current?.updatedAt).toBe("2026-01-01T00:05:00.000Z");
        expect(result.current?.noAuthorizedTargets).toBe(false);
        expect(result.current?.isLoading).toBe(false);

        // The caller's poll interval only drives the recent query.
        const recentOptions = findQueryOptions(
            (queryKey) => queryKey[0] === "hostedStatsRecent",
        );
        expect(recentOptions.refetchInterval).toBe(30_000);
        const summaryOptions = findQueryOptions(
            (queryKey) => queryKey[0] === "hostedStatsSummary",
        );
        expect(summaryOptions.refetchInterval).toBeUndefined();
    });

    it("reports when no stats targets are authorized", async () => {
        const hostedClient = makeHostedClient({
            createStatsSession: jest
                .fn()
                .mockRejectedValue(
                    new HostedApiClientRequestError(
                        "no targets",
                        403,
                        "stats.no_authorized_targets",
                    ),
                ),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const result = renderHook(queryClient, () =>
            useHostedHomeWidgetStats(makeInput({ hostedClient }), true, false),
        );
        await waitFor(() => {
            expect(result.current?.noAuthorizedTargets).toBe(true);
        });

        expect(result.current?.summary).toBeNull();
        expect(result.current?.recent).toBeNull();
        expect(result.current?.isLoading).toBe(false);
        expect(hostedClient.getSummary).not.toHaveBeenCalled();
        expect(hostedClient.getRecent).not.toHaveBeenCalled();
    });
});

type SessionClient = ReturnType<typeof createHostedSessionClient>;
type HostedClient = ReturnType<typeof createHostedApiClient>;
type StatsInput = Parameters<typeof useHostedStatsSessionQuery>[0];

function makeSession(): HostedSession {
    return {
        accountId: "acc_123",
        accessToken: "access.token",
        accessTokenExpiresAtMs: 1_000_000,
        refreshToken: "refresh.token",
        refreshTokenExpiresAtMs: 2_000_000,
        personalPairingWrapperBaseUrl: null,
        accountProfile: null,
    };
}

function makeSessionClient(overrides?: Partial<SessionClient>): SessionClient {
    return {
        login: jest.fn(),
        refresh: jest.fn(),
        loadHostedSession: jest.fn().mockResolvedValue(null),
        persistHostedSession: jest.fn(),
        clearHostedSession: jest.fn(),
        ...overrides,
    };
}

function makeHostedClient(overrides?: Partial<HostedClient>): HostedClient {
    return {
        getConduitsSnapshot: jest.fn(),
        getAccountProfile: jest.fn(),
        updateAccountProfile: jest.fn(),
        deleteAccount: jest.fn(),
        createBillingPortalSession: jest.fn(),
        setPersonalCompartmentId: jest.fn(),
        getPlanCatalog: jest.fn(),
        createStatsSession: jest.fn(),
        getSummary: jest.fn(),
        getRecent: jest.fn(),
        getLive: jest.fn(),
        ...overrides,
    };
}

function makeInput(overrides: {
    hostedClient?: HostedClient;
    sessionClient?: SessionClient;
    now?: () => number;
}): StatsInput {
    return {
        baseUrl: BASE_URL,
        now: overrides.now ?? (() => 20_000),
        sessionClient: overrides.sessionClient ?? makeSessionClient(),
        hostedClient: overrides.hostedClient ?? makeHostedClient(),
    };
}

function makeQueryClient(): QueryClient {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: Infinity },
            mutations: { retry: false },
        },
    });
    mountedQueryClients.push(queryClient);
    return queryClient;
}

function renderHook<T>(
    queryClient: QueryClient,
    useHook: () => T,
): { current: T | null } {
    const result: { current: T | null } = { current: null };
    function Probe() {
        result.current = useHook();
        return null;
    }
    act(() => {
        mountedRenderers.push(
            create(
                <QueryClientProvider client={queryClient}>
                    <Probe />
                </QueryClientProvider>,
            ),
        );
    });
    return result;
}

function findQueryOptions(
    predicate: (queryKey: readonly unknown[]) => boolean,
): Record<string, unknown> {
    const options = (useQuery as unknown as jest.Mock).mock.calls
        .map((call) => call[0] as { queryKey: readonly unknown[] })
        .filter((candidate) => predicate(candidate.queryKey))
        .pop();
    if (!options) {
        throw new Error("useQuery was not called with a matching query key");
    }
    return options as unknown as Record<string, unknown>;
}

const mountedRenderers: ReactTestRenderer[] = [];
const mountedQueryClients: QueryClient[] = [];

function unmountAll(): void {
    mountedRenderers.splice(0).forEach((renderer) => {
        act(() => {
            renderer.unmount();
        });
    });
    mountedQueryClients.splice(0).forEach((queryClient) => {
        queryClient.clear();
    });
}

async function flushPromises(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

async function waitFor(assertion: () => void): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 12; attempt += 1) {
        try {
            assertion();
            return;
        } catch (error) {
            lastError = error;
            await flushPromises();
        }
    }

    throw lastError;
}

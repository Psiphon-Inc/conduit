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
    Query,
    QueryClient,
    QueryClientProvider,
    useQuery,
} from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { ReactTestRenderer, act, create } from "react-test-renderer";

import { QUERYKEY_CONDUIT_NAME } from "@/src/constants";
import {
    HostedApiClientRequestError,
    createHostedApiClient,
} from "@/src/hosted/apiClient";
import {
    fetchHostedConduitsSnapshot,
    useHostedConduitsQuery,
} from "@/src/hosted/conduitQueries";
import {
    HostedSession,
    createHostedSessionClient,
} from "@/src/hosted/sessionClient";

jest.mock("@tanstack/react-query", () => {
    const actual = jest.requireActual("@tanstack/react-query");
    return {
        ...actual,
        useQuery: jest.fn(actual.useQuery),
    };
});

const BASE_URL = "https://hcb.example.test";
const SESSION_KEY = ["hostedStation", BASE_URL, "session"];
const CONDUITS_KEY = ["hostedStation", BASE_URL, "conduits", "acc_123"];

const SNAPSHOT = {
    entitlement: { status: "active", product_id: "test.product.primary" },
    conduits: [
        {
            conduit_id: "cond_1",
            proxy_id: "st_1",
            status: "active",
        },
    ],
};

describe("useHostedConduitsQuery", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-expect-error test-only mock helper
        SecureStore.__resetStore();
    });

    afterEach(unmountAll);

    it("fetches the conduits snapshot under the account-scoped key", async () => {
        const hostedClient = makeHostedClient({
            getConduitsSnapshot: jest.fn().mockResolvedValue(SNAPSHOT),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const result = renderHook(queryClient, () =>
            useHostedConduitsQuery(makeInput({ hostedClient })),
        );
        await waitFor(() => {
            expect(result.current?.data).toEqual(SNAPSHOT);
        });

        expect(hostedClient.getConduitsSnapshot).toHaveBeenCalledWith(
            "access.token",
        );
        expect(
            queryClient
                .getQueryCache()
                .getAll()
                .map((query) => query.queryKey),
        ).toContainEqual(CONDUITS_KEY);

        const options = findQueryOptions(
            (queryKey) => queryKey[2] === "conduits",
        );
        expect(options.enabled).toBe(true);
        expect(options.retry).toBe(3);
        expect(options.refetchOnReconnect).toBe(true);
    });

    it("is disabled and does not retry while offline", async () => {
        const hostedClient = makeHostedClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const result = renderHook(queryClient, () =>
            useHostedConduitsQuery(
                makeInput({ hostedClient, isOnline: false }),
            ),
        );
        await flushPromises();

        expect(hostedClient.getConduitsSnapshot).not.toHaveBeenCalled();
        expect(result.current?.fetchStatus).toBe("idle");
        const options = findQueryOptions(
            (queryKey) => queryKey[2] === "conduits",
        );
        expect(options.enabled).toBe(false);
        expect(options.retry).toBe(false);
    });

    it("is disabled until the hosted session resolves an account", async () => {
        const hostedClient = makeHostedClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, null);

        renderHook(queryClient, () =>
            useHostedConduitsQuery(makeInput({ hostedClient })),
        );
        await flushPromises();

        expect(hostedClient.getConduitsSnapshot).not.toHaveBeenCalled();
        expect(
            queryClient
                .getQueryCache()
                .getAll()
                .map((query) => query.queryKey),
        ).toContainEqual(["hostedStation", BASE_URL, "conduits", null]);
    });

    it("derives the poll interval from errors and poll_after_seconds hints", async () => {
        const hostedClient = makeHostedClient({
            getConduitsSnapshot: jest.fn().mockResolvedValue(SNAPSHOT),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        renderHook(queryClient, () =>
            useHostedConduitsQuery(makeInput({ hostedClient })),
        );
        await flushPromises();

        const options = findQueryOptions(
            (queryKey) => queryKey[2] === "conduits",
        );
        const refetchInterval = options.refetchInterval as (
            query: Query,
        ) => number | false;

        expect(refetchInterval(makeFakeQuery({ error: new Error("x") }))).toBe(
            10_000,
        );
        expect(
            refetchInterval(
                makeFakeQuery({
                    data: { ...SNAPSHOT, poll_after_seconds: 45 },
                }),
            ),
        ).toBe(45_000);
        expect(
            refetchInterval(
                makeFakeQuery({
                    data: {
                        ...SNAPSHOT,
                        conduits: [
                            { ...SNAPSHOT.conduits[0], poll_after_seconds: 30 },
                        ],
                    },
                }),
            ),
        ).toBe(30_000);
        expect(refetchInterval(makeFakeQuery({ data: SNAPSHOT }))).toBe(false);
        expect(refetchInterval(makeFakeQuery({ data: undefined }))).toBe(false);

        // The offline variant always suppresses polling, even with hints.
        unmountAll();
        jest.clearAllMocks();
        const offlineQueryClient = makeQueryClient();
        offlineQueryClient.setQueryData(SESSION_KEY, makeSession());
        renderHook(offlineQueryClient, () =>
            useHostedConduitsQuery(
                makeInput({
                    hostedClient: makeHostedClient(),
                    isOnline: false,
                }),
            ),
        );
        await flushPromises();
        const offlineOptions = findQueryOptions(
            (queryKey) => queryKey[2] === "conduits",
        );
        const offlineRefetchInterval = offlineOptions.refetchInterval as (
            query: Query,
        ) => number | false;
        expect(
            offlineRefetchInterval(
                makeFakeQuery({
                    data: { ...SNAPSHOT, poll_after_seconds: 45 },
                }),
            ),
        ).toBe(false);
        expect(
            offlineRefetchInterval(makeFakeQuery({ error: new Error("x") })),
        ).toBe(false);
    });
});

describe("fetchHostedConduitsSnapshot", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-expect-error test-only mock helper
        SecureStore.__resetStore();
    });

    afterEach(unmountAll);

    it("refreshes the session and retries a 401 snapshot fetch", async () => {
        const session = makeSession();
        const refreshed = {
            ...session,
            accessToken: "access.new",
            accessTokenExpiresAtMs: 4_000_000,
        };
        const sessionClient = makeSessionClient({
            refresh: jest.fn().mockResolvedValue(refreshed),
        });
        const hostedClient = makeHostedClient({
            getConduitsSnapshot: jest
                .fn()
                .mockRejectedValueOnce(
                    new HostedApiClientRequestError(
                        "access token rejected",
                        401,
                    ),
                )
                .mockResolvedValueOnce(SNAPSHOT),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, session);

        const snapshot = await fetchHostedConduitsSnapshot(
            queryClient,
            makeInput({ hostedClient, sessionClient }),
        );

        expect(snapshot).toEqual(SNAPSHOT);
        expect(sessionClient.refresh).toHaveBeenCalledTimes(1);
        expect(hostedClient.getConduitsSnapshot).toHaveBeenNthCalledWith(
            1,
            "access.token",
        );
        expect(hostedClient.getConduitsSnapshot).toHaveBeenNthCalledWith(
            2,
            "access.new",
        );
    });

    it("syncs profile caches when the snapshot carries an account profile", async () => {
        const profile = {
            alias: "Snapshot Alias",
            alias_is_default: false,
            profile_version: 4,
        };
        const snapshotWithAccount = { ...SNAPSHOT, account: profile };
        const sessionClient = makeSessionClient();
        const hostedClient = makeHostedClient({
            getConduitsSnapshot: jest
                .fn()
                .mockResolvedValue(snapshotWithAccount),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        const snapshot = await fetchHostedConduitsSnapshot(
            queryClient,
            makeInput({ hostedClient, sessionClient }),
        );

        expect(snapshot).toEqual(snapshotWithAccount);
        expect(
            queryClient.getQueryData([
                "hostedStation",
                BASE_URL,
                "account-profile",
                "acc_123",
            ]),
        ).toEqual(profile);
        expect(queryClient.getQueryData([QUERYKEY_CONDUIT_NAME])).toBe(
            "Snapshot Alias",
        );
        expect(sessionClient.persistHostedSession).toHaveBeenCalledWith(
            expect.objectContaining({ accountProfile: profile }),
        );
        expect(
            queryClient.getQueryData<HostedSession>(SESSION_KEY)
                ?.accountProfile,
        ).toEqual(profile);
    });

    it("leaves profile caches untouched when the snapshot has no account", async () => {
        const sessionClient = makeSessionClient();
        const hostedClient = makeHostedClient({
            getConduitsSnapshot: jest.fn().mockResolvedValue(SNAPSHOT),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession());

        await fetchHostedConduitsSnapshot(
            queryClient,
            makeInput({ hostedClient, sessionClient }),
        );

        expect(sessionClient.persistHostedSession).not.toHaveBeenCalled();
        expect(
            queryClient.getQueryData([
                "hostedStation",
                BASE_URL,
                "account-profile",
                "acc_123",
            ]),
        ).toBeUndefined();
        expect(
            queryClient.getQueryData([QUERYKEY_CONDUIT_NAME]),
        ).toBeUndefined();
    });
});

type SessionClient = ReturnType<typeof createHostedSessionClient>;
type HostedClient = ReturnType<typeof createHostedApiClient>;
type ConduitInput = Parameters<typeof useHostedConduitsQuery>[0];

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
    isOnline?: boolean;
}): ConduitInput {
    return {
        baseUrl: BASE_URL,
        now: () => 20_000,
        sessionClient: overrides.sessionClient ?? makeSessionClient(),
        hostedClient: overrides.hostedClient ?? makeHostedClient(),
        isOnline: overrides.isOnline,
    };
}

function makeFakeQuery(state: { error?: Error; data?: unknown }): Query {
    return {
        state: {
            error: state.error ?? null,
            data: state.data,
        },
    } as unknown as Query;
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

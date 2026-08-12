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
    useQuery,
} from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { ReactTestRenderer, act, create } from "react-test-renderer";

import {
    QUERYKEY_CONDUIT_NAME,
    SECURESTORE_CONDUIT_NAME_KEY,
} from "@/src/constants";
import { HostedApiClientRequestError } from "@/src/hosted/apiClient";
import {
    HostedApiRequestError,
    HostedSession,
    createHostedSessionClient,
} from "@/src/hosted/sessionClient";
import {
    HostedSessionDependencies,
    clearHostedSessionState,
    ensureHostedSession,
    refreshHostedSession,
    setHostedSessionState,
    useHostedSessionQuery,
    withHostedSessionRecovery,
} from "@/src/hosted/sessionQueries";

jest.mock("@tanstack/react-query", () => {
    const actual = jest.requireActual("@tanstack/react-query");
    return {
        ...actual,
        useQuery: jest.fn(actual.useQuery),
    };
});

const BASE_URL = "https://hcb.example.test";
const SESSION_KEY = ["hostedStation", BASE_URL, "session"];

describe("useHostedSessionQuery", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-expect-error test-only mock helper
        SecureStore.__resetStore();
    });

    afterEach(unmountAll);

    it("loads the persisted session under a stable key with non-expiring cache config", async () => {
        const session = makeSession({});
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(session),
        });
        const queryClient = makeQueryClient();

        const result = renderHook(queryClient, () =>
            useHostedSessionQuery(makeInput({ sessionClient })),
        );
        await waitFor(() => {
            expect(result.current?.data).toEqual(session);
        });

        expect(sessionClient.loadHostedSession).toHaveBeenCalledTimes(1);
        expect(
            queryClient
                .getQueryCache()
                .getAll()
                .map((query) => query.queryKey),
        ).toEqual([SESSION_KEY]);

        const options = findQueryOptions(
            (queryKey) => queryKey[2] === "session",
        );
        expect(options.staleTime).toBe(Infinity);
        expect(options.gcTime).toBe(Infinity);
        expect(options.retry).toBe(false);
        expect(options.enabled).toBe(true);
    });

    it("is disabled while no base URL is configured", async () => {
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();

        const result = renderHook(queryClient, () =>
            useHostedSessionQuery(makeInput({ baseUrl: "", sessionClient })),
        );
        await flushPromises();

        expect(sessionClient.loadHostedSession).not.toHaveBeenCalled();
        expect(result.current?.fetchStatus).toBe("idle");
        expect(result.current?.isPending).toBe(true);
        const options = findQueryOptions(
            (queryKey) => queryKey[2] === "session",
        );
        expect(options.enabled).toBe(false);
    });

    it("clears corrupt persisted sessions and resolves null", async () => {
        const sessionClient = makeSessionClient({
            loadHostedSession: jest
                .fn()
                .mockRejectedValue(new Error("Invalid hosted session state")),
        });
        const queryClient = makeQueryClient();

        const result = renderHook(queryClient, () =>
            useHostedSessionQuery(makeInput({ sessionClient })),
        );
        await waitFor(() => {
            expect(result.current?.isSuccess).toBe(true);
        });

        expect(result.current?.data).toBeNull();
        expect(sessionClient.clearHostedSession).toHaveBeenCalledTimes(1);
    });
});

describe("ensureHostedSession", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-expect-error test-only mock helper
        SecureStore.__resetStore();
    });

    it("returns the cached session unchanged while tokens are current", async () => {
        const session = makeSession({ accessTokenExpiresAtMs: 100_000 });
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, session);

        // 15s expiry skew: 84_999 is just inside the freshness window.
        const ensured = await ensureHostedSession(
            queryClient,
            makeInput({ sessionClient, now: () => 84_999 }),
        );

        expect(ensured).toBe(session);
        expect(sessionClient.refresh).not.toHaveBeenCalled();
        expect(sessionClient.loadHostedSession).not.toHaveBeenCalled();
    });

    it("loads the persisted session when the cache is empty", async () => {
        const session = makeSession({ accessTokenExpiresAtMs: 100_000 });
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(session),
        });
        const queryClient = makeQueryClient();

        const ensured = await ensureHostedSession(
            queryClient,
            makeInput({ sessionClient, now: () => 20_000 }),
        );

        expect(ensured).toEqual(session);
        expect(queryClient.getQueryData(SESSION_KEY)).toEqual(session);
    });

    it("throws when no session is persisted", async () => {
        const sessionClient = makeSessionClient({
            loadHostedSession: jest.fn().mockResolvedValue(null),
        });
        const queryClient = makeQueryClient();

        await expect(
            ensureHostedSession(
                queryClient,
                makeInput({ sessionClient, now: () => 20_000 }),
            ),
        ).rejects.toThrow("Hosted session not found");
    });

    it("refreshes once the access token is within the 15s expiry skew", async () => {
        const session = makeSession({ accessTokenExpiresAtMs: 100_000 });
        const refreshed = makeSession({
            accessToken: "access.new",
            accessTokenExpiresAtMs: 400_000,
        });
        const sessionClient = makeSessionClient({
            refresh: jest.fn().mockResolvedValue(refreshed),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, session);

        const ensured = await ensureHostedSession(
            queryClient,
            makeInput({ sessionClient, now: () => 85_000 }),
        );

        expect(sessionClient.refresh).toHaveBeenCalledTimes(1);
        expect(ensured).toEqual(refreshed);
        expect(queryClient.getQueryData(SESSION_KEY)).toEqual(refreshed);
        expect(sessionClient.persistHostedSession).toHaveBeenCalledWith(
            refreshed,
        );
    });

    it("clears state and demands sign-in when the refresh token has expired", async () => {
        const session = makeSession({
            accessTokenExpiresAtMs: 100_000,
            refreshTokenExpiresAtMs: 200_000,
        });
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, session);

        await expect(
            ensureHostedSession(
                queryClient,
                makeInput({ sessionClient, now: () => 185_000 }),
            ),
        ).rejects.toThrow("Hosted session has expired; please sign in again");

        expect(sessionClient.clearHostedSession).toHaveBeenCalledTimes(1);
        expect(queryClient.getQueryData(SESSION_KEY)).toBeNull();
        expect(sessionClient.refresh).not.toHaveBeenCalled();
    });

    it("clears state when the refresh endpoint rejects with 401", async () => {
        const session = makeSession({ accessTokenExpiresAtMs: 100_000 });
        const sessionClient = makeSessionClient({
            refresh: jest
                .fn()
                .mockRejectedValue(
                    new HostedApiRequestError("refresh rejected", 401),
                ),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, session);

        await expect(
            ensureHostedSession(
                queryClient,
                makeInput({ sessionClient, now: () => 85_000 }),
            ),
        ).rejects.toThrow("Hosted session expired; please sign in again");

        expect(sessionClient.clearHostedSession).toHaveBeenCalledTimes(1);
        expect(queryClient.getQueryData(SESSION_KEY)).toBeNull();
    });

    it("propagates non-401 refresh failures without clearing state", async () => {
        const session = makeSession({ accessTokenExpiresAtMs: 100_000 });
        const refreshError = new HostedApiRequestError("upstream down", 503);
        const sessionClient = makeSessionClient({
            refresh: jest.fn().mockRejectedValue(refreshError),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, session);

        await expect(
            ensureHostedSession(
                queryClient,
                makeInput({ sessionClient, now: () => 85_000 }),
            ),
        ).rejects.toBe(refreshError);

        expect(sessionClient.clearHostedSession).not.toHaveBeenCalled();
        expect(queryClient.getQueryData(SESSION_KEY)).toEqual(session);
    });
});

describe("refreshHostedSession", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-expect-error test-only mock helper
        SecureStore.__resetStore();
    });

    it("dedupes concurrent refreshes per query client and base URL", async () => {
        const refreshed = makeSession({
            accessToken: "access.new",
            accessTokenExpiresAtMs: 400_000,
        });
        const deferred = createDeferred<HostedSession>();
        const sessionClient = makeSessionClient({
            refresh: jest.fn().mockReturnValue(deferred.promise),
        });
        const queryClient = makeQueryClient();
        const input = makeInput({ sessionClient, now: () => 20_000 });

        const first = refreshHostedSession(queryClient, input);
        const second = refreshHostedSession(queryClient, input);
        deferred.resolve(refreshed);

        await expect(first).resolves.toEqual(refreshed);
        await expect(second).resolves.toEqual(refreshed);
        expect(sessionClient.refresh).toHaveBeenCalledTimes(1);

        // After the in-flight refresh settles, a new call refreshes again.
        (sessionClient.refresh as jest.Mock).mockResolvedValue(refreshed);
        await refreshHostedSession(queryClient, input);
        expect(sessionClient.refresh).toHaveBeenCalledTimes(2);
    });
});

describe("withHostedSessionRecovery", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-expect-error test-only mock helper
        SecureStore.__resetStore();
    });

    it("runs the request with the ensured session", async () => {
        const session = makeSession({ accessTokenExpiresAtMs: 100_000 });
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, session);
        const request = jest.fn().mockResolvedValue("payload");

        const result = await withHostedSessionRecovery(
            queryClient,
            makeInput({ sessionClient, now: () => 20_000 }),
            request,
        );

        expect(result).toBe("payload");
        expect(request).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenCalledWith(session);
    });

    it("refreshes and retries exactly once after a hosted-client 401", async () => {
        const session = makeSession({ accessTokenExpiresAtMs: 100_000 });
        const refreshed = makeSession({
            accessToken: "access.new",
            accessTokenExpiresAtMs: 400_000,
        });
        const sessionClient = makeSessionClient({
            refresh: jest.fn().mockResolvedValue(refreshed),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, session);
        const request = jest
            .fn()
            .mockRejectedValueOnce(
                new HostedApiClientRequestError("access token rejected", 401),
            )
            .mockResolvedValueOnce("payload");

        const result = await withHostedSessionRecovery(
            queryClient,
            makeInput({ sessionClient, now: () => 20_000 }),
            request,
        );

        expect(result).toBe("payload");
        expect(sessionClient.refresh).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenNthCalledWith(1, session);
        expect(request).toHaveBeenNthCalledWith(2, refreshed);
    });

    it("does not recover from non-401 request failures", async () => {
        const session = makeSession({ accessTokenExpiresAtMs: 100_000 });
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, session);
        const requestError = new HostedApiClientRequestError(
            "rate limited",
            429,
        );
        const request = jest.fn().mockRejectedValue(requestError);

        await expect(
            withHostedSessionRecovery(
                queryClient,
                makeInput({ sessionClient, now: () => 20_000 }),
                request,
            ),
        ).rejects.toBe(requestError);

        expect(sessionClient.refresh).not.toHaveBeenCalled();
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("only recovers from HostedApiClientRequestError 401s, not session-client 401s", async () => {
        const session = makeSession({ accessTokenExpiresAtMs: 100_000 });
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, session);
        const requestError = new HostedApiRequestError("unauthorized", 401);
        const request = jest.fn().mockRejectedValue(requestError);

        await expect(
            withHostedSessionRecovery(
                queryClient,
                makeInput({ sessionClient, now: () => 20_000 }),
                request,
            ),
        ).rejects.toBe(requestError);

        expect(sessionClient.refresh).not.toHaveBeenCalled();
        expect(request).toHaveBeenCalledTimes(1);
    });
});

describe("setHostedSessionState", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-expect-error test-only mock helper
        SecureStore.__resetStore();
    });

    it("stores null without persisting anything", async () => {
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession({}));

        await setHostedSessionState(
            queryClient,
            makeInput({ sessionClient, now: () => 20_000 }),
            null,
        );

        expect(queryClient.getQueryData(SESSION_KEY)).toBeNull();
        expect(sessionClient.persistHostedSession).not.toHaveBeenCalled();
        expect(sessionClient.clearHostedSession).not.toHaveBeenCalled();
    });

    it("persists the session and fans out the account profile caches", async () => {
        const profile = {
            alias: "Custom Alias",
            alias_is_default: false,
            profile_version: 3,
        };
        const session = makeSession({ accountProfile: profile });
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();

        await setHostedSessionState(
            queryClient,
            makeInput({ sessionClient, now: () => 20_000 }),
            session,
        );

        expect(queryClient.getQueryData(SESSION_KEY)).toEqual(session);
        expect(sessionClient.persistHostedSession).toHaveBeenCalledWith(
            session,
        );
        expect(
            queryClient.getQueryData([
                "hostedStation",
                BASE_URL,
                "account-profile",
                "acc_123",
            ]),
        ).toEqual(profile);
        expect(queryClient.getQueryData([QUERYKEY_CONDUIT_NAME])).toBe(
            "Custom Alias",
        );
        await expect(
            SecureStore.getItemAsync(SECURESTORE_CONDUIT_NAME_KEY),
        ).resolves.toBe("Custom Alias");
    });

    it("keeps the newest access token when an older write races in", async () => {
        const current = makeSession({
            accessToken: "access.newest",
            accessTokenExpiresAtMs: 500_000,
        });
        const stale = makeSession({
            accessToken: "access.stale",
            accessTokenExpiresAtMs: 100_000,
            accountProfile: {
                alias: "Fresh Alias",
                alias_is_default: false,
                profile_version: 7,
            },
            personalPairingWrapperBaseUrl: "https://pp.example.test",
        });
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, current);

        await setHostedSessionState(
            queryClient,
            makeInput({ sessionClient, now: () => 20_000 }),
            stale,
        );

        const merged = queryClient.getQueryData<HostedSession>(SESSION_KEY);
        expect(merged?.accessToken).toBe("access.newest");
        expect(merged?.accessTokenExpiresAtMs).toBe(500_000);
        expect(merged?.accountProfile).toEqual(stale.accountProfile);
        expect(merged?.personalPairingWrapperBaseUrl).toBe(
            "https://pp.example.test",
        );
        expect(sessionClient.persistHostedSession).toHaveBeenCalledWith(merged);
    });

    it("replaces the session outright for a different account", async () => {
        const current = makeSession({
            accessToken: "access.newest",
            accessTokenExpiresAtMs: 500_000,
        });
        const next = makeSession({
            accountId: "acc_456",
            accessToken: "access.other",
            accessTokenExpiresAtMs: 100_000,
        });
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, current);

        await setHostedSessionState(
            queryClient,
            makeInput({ sessionClient, now: () => 20_000 }),
            next,
        );

        expect(queryClient.getQueryData(SESSION_KEY)).toEqual(next);
        // No account profile on the new session, so no profile cache write.
        expect(
            queryClient.getQueryData([
                "hostedStation",
                BASE_URL,
                "account-profile",
                "acc_456",
            ]),
        ).toBeUndefined();
    });
});

describe("clearHostedSessionState", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("clears the persisted and cached session state", async () => {
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession({}));

        await clearHostedSessionState(
            queryClient,
            makeInput({ sessionClient, now: () => 20_000 }),
        );

        expect(sessionClient.clearHostedSession).toHaveBeenCalledTimes(1);
        expect(queryClient.getQueryData(SESSION_KEY)).toBeNull();
    });
});

type SessionClient = ReturnType<typeof createHostedSessionClient>;

function makeSession(input: {
    accountId?: string;
    accessToken?: string;
    accessTokenExpiresAtMs?: number;
    refreshTokenExpiresAtMs?: number;
    accountProfile?: HostedSession["accountProfile"];
    personalPairingWrapperBaseUrl?: string | null;
}): HostedSession {
    return {
        accountId: input.accountId ?? "acc_123",
        accessToken: input.accessToken ?? "access.token",
        accessTokenExpiresAtMs: input.accessTokenExpiresAtMs ?? 1_000_000,
        refreshToken: "refresh.token",
        refreshTokenExpiresAtMs: input.refreshTokenExpiresAtMs ?? 2_000_000,
        personalPairingWrapperBaseUrl:
            input.personalPairingWrapperBaseUrl ?? null,
        accountProfile: input.accountProfile ?? null,
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

function makeInput(overrides: {
    baseUrl?: string;
    now?: () => number;
    sessionClient?: SessionClient;
}): HostedSessionDependencies {
    return {
        baseUrl: overrides.baseUrl ?? BASE_URL,
        now: overrides.now ?? (() => 20_000),
        sessionClient: overrides.sessionClient ?? makeSessionClient(),
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

function createDeferred<T>(): {
    promise: Promise<T>;
    resolve(value: T): void;
} {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((promiseResolve) => {
        resolve = promiseResolve;
    });
    return { promise, resolve };
}

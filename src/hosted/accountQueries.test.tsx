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
import {
    syncHostedProfileCaches,
    updateHostedAccountAlias,
    useHostedAccountProfileQuery,
    useHostedUpdateAccountAliasMutation,
} from "@/src/hosted/accountQueries";
import {
    HostedAccountProfileConflictError,
    HostedApiClientRequestError,
    createHostedApiClient,
} from "@/src/hosted/apiClient";
import { AccountProfile } from "@/src/hosted/contracts";
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
const ACCOUNT_PROFILE_KEY = [
    "hostedStation",
    BASE_URL,
    "account-profile",
    "acc_123",
];
const CONDUITS_KEY = ["hostedStation", BASE_URL, "conduits", "acc_123"];

describe("useHostedAccountProfileQuery", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-expect-error test-only mock helper
        SecureStore.__resetStore();
    });

    afterEach(unmountAll);

    it("fetches the account profile under the account-scoped key and syncs caches", async () => {
        const fetchedProfile = makeProfile({
            alias: "Fetched Alias",
            profile_version: 5,
        });
        const hostedClient = makeHostedClient({
            getAccountProfile: jest.fn().mockResolvedValue(fetchedProfile),
        });
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession({}));

        const result = renderHook(queryClient, () =>
            useHostedAccountProfileQuery(
                makeInput({ hostedClient, sessionClient }),
            ),
        );
        await waitFor(() => {
            expect(result.current?.data).toEqual(fetchedProfile);
        });

        expect(hostedClient.getAccountProfile).toHaveBeenCalledWith(
            "access.token",
        );
        expect(
            queryClient
                .getQueryCache()
                .getAll()
                .map((query) => query.queryKey),
        ).toContainEqual(ACCOUNT_PROFILE_KEY);
        expect(queryClient.getQueryData(ACCOUNT_PROFILE_KEY)).toEqual(
            fetchedProfile,
        );
        expect(queryClient.getQueryData([QUERYKEY_CONDUIT_NAME])).toBe(
            "Fetched Alias",
        );
        await expect(
            SecureStore.getItemAsync(SECURESTORE_CONDUIT_NAME_KEY),
        ).resolves.toBe("Fetched Alias");
        expect(sessionClient.persistHostedSession).toHaveBeenCalledWith(
            expect.objectContaining({ accountProfile: fetchedProfile }),
        );

        const options = findQueryOptions(
            (queryKey) => queryKey[2] === "account-profile",
        );
        expect(options.enabled).toBe(true);
    });

    it("uses the session profile as initial data while still fetching fresh state", async () => {
        const sessionProfile = makeProfile({
            alias: "Session Alias",
            profile_version: 2,
        });
        const freshProfile = makeProfile({
            alias: "Fresh Alias",
            profile_version: 3,
        });
        const hostedClient = makeHostedClient({
            getAccountProfile: jest.fn().mockResolvedValue(freshProfile),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(
            SESSION_KEY,
            makeSession({ accountProfile: sessionProfile }),
        );

        const result = renderHook(queryClient, () =>
            useHostedAccountProfileQuery(makeInput({ hostedClient })),
        );

        expect(result.current?.data).toEqual(sessionProfile);
        await waitFor(() => {
            expect(result.current?.data).toEqual(freshProfile);
        });
        expect(hostedClient.getAccountProfile).toHaveBeenCalledTimes(1);

        expect(queryClient.getQueryData(ACCOUNT_PROFILE_KEY)).toEqual(
            freshProfile,
        );
    });

    it("is disabled until the session resolves an account id", async () => {
        const hostedClient = makeHostedClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, null);

        const result = renderHook(queryClient, () =>
            useHostedAccountProfileQuery(makeInput({ hostedClient })),
        );
        await flushPromises();

        expect(hostedClient.getAccountProfile).not.toHaveBeenCalled();
        expect(result.current?.fetchStatus).toBe("idle");
        expect(
            queryClient
                .getQueryCache()
                .getAll()
                .map((query) => query.queryKey),
        ).toContainEqual(["hostedStation", BASE_URL, "account-profile", null]);

        const options = findQueryOptions(
            (queryKey) => queryKey[2] === "account-profile",
        );
        expect(options.enabled).toBe(false);
        expect(options.initialData).toBeNull();
    });

    it("refreshes the hosted session and retries after a hosted-client 401", async () => {
        const profile = makeProfile({ alias: "Recovered Alias" });
        const session = makeSession({});
        const refreshed = makeSession({
            accessToken: "access.new",
            accessTokenExpiresAtMs: 4_000_000,
        });
        const sessionClient = makeSessionClient({
            refresh: jest.fn().mockResolvedValue(refreshed),
        });
        const hostedClient = makeHostedClient({
            getAccountProfile: jest
                .fn()
                .mockRejectedValueOnce(
                    new HostedApiClientRequestError(
                        "access token rejected",
                        401,
                    ),
                )
                .mockResolvedValueOnce(profile),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, session);

        const result = renderHook(queryClient, () =>
            useHostedAccountProfileQuery(
                makeInput({ hostedClient, sessionClient }),
            ),
        );
        await waitFor(() => {
            expect(result.current?.data).toEqual(profile);
        });

        expect(sessionClient.refresh).toHaveBeenCalledTimes(1);
        expect(hostedClient.getAccountProfile).toHaveBeenNthCalledWith(
            1,
            "access.token",
        );
        expect(hostedClient.getAccountProfile).toHaveBeenNthCalledWith(
            2,
            "access.new",
        );
    });
});

describe("updateHostedAccountAlias", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-expect-error test-only mock helper
        SecureStore.__resetStore();
    });

    afterEach(unmountAll);

    it("updates the alias using the cached profile version and fans out caches", async () => {
        const currentProfile = makeProfile({ profile_version: 7 });
        const updatedProfile = makeProfile({
            alias: "New Alias",
            profile_version: 8,
        });
        const hostedClient = makeHostedClient({
            updateAccountProfile: jest.fn().mockResolvedValue(updatedProfile),
        });
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(
            SESSION_KEY,
            makeSession({
                accountProfile: makeProfile({ profile_version: 1 }),
            }),
        );
        queryClient.setQueryData(ACCOUNT_PROFILE_KEY, currentProfile);
        queryClient.setQueryData(CONDUITS_KEY, {
            account: currentProfile,
            conduits: [],
            entitlement: { status: "active" },
        });

        const result = await updateHostedAccountAlias(
            queryClient,
            makeInput({ hostedClient, sessionClient }),
            "New Alias",
        );

        expect(result).toEqual(updatedProfile);
        expect(hostedClient.updateAccountProfile).toHaveBeenCalledWith(
            "access.token",
            { alias: "New Alias", expected_profile_version: 7 },
        );
        expect(queryClient.getQueryData(ACCOUNT_PROFILE_KEY)).toEqual(
            updatedProfile,
        );
        expect(queryClient.getQueryData(CONDUITS_KEY)).toEqual({
            account: updatedProfile,
            conduits: [],
            entitlement: { status: "active" },
        });
        expect(
            queryClient.getQueryData<HostedSession>(SESSION_KEY)
                ?.accountProfile,
        ).toEqual(updatedProfile);
        expect(queryClient.getQueryData([QUERYKEY_CONDUIT_NAME])).toBe(
            "New Alias",
        );
        expect(sessionClient.persistHostedSession).toHaveBeenCalledWith(
            expect.objectContaining({ accountProfile: updatedProfile }),
        );
    });

    it("falls back to the session profile when no profile query data exists", async () => {
        const sessionProfile = makeProfile({ profile_version: 11 });
        const updatedProfile = makeProfile({
            alias: "Session Profile Update",
            profile_version: 12,
        });
        const hostedClient = makeHostedClient({
            updateAccountProfile: jest.fn().mockResolvedValue(updatedProfile),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(
            SESSION_KEY,
            makeSession({ accountProfile: sessionProfile }),
        );

        await updateHostedAccountAlias(
            queryClient,
            makeInput({ hostedClient }),
            "Session Profile Update",
        );

        expect(hostedClient.updateAccountProfile).toHaveBeenCalledWith(
            "access.token",
            {
                alias: "Session Profile Update",
                expected_profile_version: 11,
            },
        );
    });

    it("returns and syncs the current profile after a conflict response", async () => {
        const currentProfile = makeProfile({ profile_version: 7 });
        const conflictProfile = makeProfile({
            alias: "Server Alias",
            profile_version: 9,
        });
        const hostedClient = makeHostedClient({
            updateAccountProfile: jest
                .fn()
                .mockRejectedValue(
                    new HostedAccountProfileConflictError(conflictProfile),
                ),
        });
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(
            SESSION_KEY,
            makeSession({ accountProfile: currentProfile }),
        );

        const result = await updateHostedAccountAlias(
            queryClient,
            makeInput({ hostedClient, sessionClient }),
            "Local Alias",
        );

        expect(result).toEqual(conflictProfile);
        expect(queryClient.getQueryData(ACCOUNT_PROFILE_KEY)).toEqual(
            conflictProfile,
        );
        expect(
            queryClient.getQueryData<HostedSession>(SESSION_KEY)
                ?.accountProfile,
        ).toEqual(conflictProfile);
        expect(sessionClient.persistHostedSession).toHaveBeenCalledWith(
            expect.objectContaining({ accountProfile: conflictProfile }),
        );
    });

    it("throws before making an update when no profile version is available", async () => {
        const hostedClient = makeHostedClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession({}));

        await expect(
            updateHostedAccountAlias(
                queryClient,
                makeInput({ hostedClient }),
                "No Profile",
            ),
        ).rejects.toThrow("Hosted account profile unavailable");

        expect(hostedClient.updateAccountProfile).not.toHaveBeenCalled();
    });

    it("the mutation hook delegates to updateHostedAccountAlias", async () => {
        const currentProfile = makeProfile({ profile_version: 1 });
        const updatedProfile = makeProfile({ alias: "Mutation Alias" });
        const hostedClient = makeHostedClient({
            updateAccountProfile: jest.fn().mockResolvedValue(updatedProfile),
        });
        const queryClient = makeQueryClient();
        queryClient.setQueryData(
            SESSION_KEY,
            makeSession({ accountProfile: currentProfile }),
        );

        const result = renderHook(queryClient, () =>
            useHostedUpdateAccountAliasMutation(makeInput({ hostedClient })),
        );
        await act(async () => {
            await result.current?.mutateAsync("Mutation Alias");
        });

        expect(hostedClient.updateAccountProfile).toHaveBeenCalledWith(
            "access.token",
            { alias: "Mutation Alias", expected_profile_version: 1 },
        );
        expect(queryClient.getQueryData(ACCOUNT_PROFILE_KEY)).toEqual(
            updatedProfile,
        );
    });
});

describe("syncHostedProfileCaches", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-expect-error test-only mock helper
        SecureStore.__resetStore();
    });

    afterEach(unmountAll);

    it("updates the alias cache, account query, current session, and conduit snapshots", async () => {
        const profile = makeProfile({
            alias: "Synced Alias",
            profile_version: 6,
        });
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();
        queryClient.setQueryData(SESSION_KEY, makeSession({}));
        queryClient.setQueryData(CONDUITS_KEY, {
            account: makeProfile({ alias: "Old Alias" }),
            conduits: [],
        });

        await syncHostedProfileCaches(
            queryClient,
            makeInput({ sessionClient }),
            { accountId: "acc_123", accountProfile: null },
            profile,
        );

        expect(queryClient.getQueryData(ACCOUNT_PROFILE_KEY)).toEqual(profile);
        expect(
            queryClient.getQueryData<HostedSession>(SESSION_KEY)
                ?.accountProfile,
        ).toEqual(profile);
        expect(queryClient.getQueryData(CONDUITS_KEY)).toEqual({
            account: profile,
            conduits: [],
        });
        expect(queryClient.getQueryData([QUERYKEY_CONDUIT_NAME])).toBe(
            "Synced Alias",
        );
        await expect(
            SecureStore.getItemAsync(SECURESTORE_CONDUIT_NAME_KEY),
        ).resolves.toBe("Synced Alias");
        expect(sessionClient.persistHostedSession).toHaveBeenCalledWith(
            expect.objectContaining({ accountProfile: profile }),
        );
    });

    it("does not rewrite the cached session for a different account", async () => {
        const profile = makeProfile({ alias: "Other Alias" });
        const sessionClient = makeSessionClient();
        const queryClient = makeQueryClient();
        const existingSession = makeSession({});
        queryClient.setQueryData(SESSION_KEY, existingSession);

        await syncHostedProfileCaches(
            queryClient,
            makeInput({ sessionClient }),
            { accountId: "acc_other", accountProfile: null },
            profile,
        );

        expect(queryClient.getQueryData(SESSION_KEY)).toEqual(existingSession);
        expect(sessionClient.persistHostedSession).not.toHaveBeenCalled();
        expect(
            queryClient.getQueryData([
                "hostedStation",
                BASE_URL,
                "account-profile",
                "acc_other",
            ]),
        ).toEqual(profile);
    });
});

type SessionClient = ReturnType<typeof createHostedSessionClient>;
type HostedClient = ReturnType<typeof createHostedApiClient>;
type AccountInput = Parameters<typeof useHostedAccountProfileQuery>[0];

function makeProfile(input?: {
    alias?: string;
    alias_is_default?: boolean;
    profile_version?: number;
}): AccountProfile {
    return {
        alias: input?.alias ?? "Account Alias",
        alias_is_default: input?.alias_is_default ?? false,
        profile_version: input?.profile_version ?? 1,
    };
}

function makeSession(input: {
    accountId?: string;
    accessToken?: string;
    accessTokenExpiresAtMs?: number;
    refreshTokenExpiresAtMs?: number;
    accountProfile?: HostedSession["accountProfile"];
}): HostedSession {
    return {
        accountId: input.accountId ?? "acc_123",
        accessToken: input.accessToken ?? "access.token",
        accessTokenExpiresAtMs: input.accessTokenExpiresAtMs ?? 1_000_000,
        refreshToken: "refresh.token",
        refreshTokenExpiresAtMs: input.refreshTokenExpiresAtMs ?? 2_000_000,
        personalPairingWrapperBaseUrl: null,
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
}): AccountInput {
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
            mutations: { retry: false, gcTime: Infinity },
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

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
    UseMutationResult,
    UseQueryResult,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";

import { cacheHostedAlias } from "@/src/hosted/aliasCache";
import {
    HostedAccountProfileConflictError,
    createHostedClient,
} from "@/src/hosted/client";
import { AccountProfile } from "@/src/hosted/contracts";
import { hostedQueryKeys } from "@/src/hosted/queryKeys";
import {
    HostedSessionDependencies,
    ensureHostedSession,
    setHostedSessionState,
    useHostedSessionQuery,
} from "@/src/hosted/sessionQueries";

type HostedClient = ReturnType<typeof createHostedClient>;

export interface HostedAccountDependencies extends HostedSessionDependencies {
    hostedClient: HostedClient;
}

export function useHostedAccountProfileQuery(
    input: HostedAccountDependencies,
): UseQueryResult<AccountProfile | null> {
    const queryClient = useQueryClient();
    const sessionQuery = useHostedSessionQuery(input);

    return useQuery({
        queryKey: hostedQueryKeys.accountProfile(
            input.baseUrl,
            sessionQuery.data?.accountId ?? null,
        ),
        enabled: Boolean(input.baseUrl && sessionQuery.data?.accountId),
        initialData: sessionQuery.data?.accountProfile ?? null,
        queryFn: async () => {
            const session = await ensureHostedSession(queryClient, input);
            const profile = await input.hostedClient.getAccountProfile(
                session.accessToken,
            );
            await syncHostedProfileCaches(queryClient, input, session, profile);
            return profile;
        },
    });
}

export function useHostedUpdateAccountAliasMutation(
    input: HostedAccountDependencies,
): UseMutationResult<AccountProfile, Error, string> {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (alias: string) =>
            updateHostedAccountAlias(queryClient, input, alias),
    });
}

export async function updateHostedAccountAlias(
    queryClient: QueryClient,
    input: HostedAccountDependencies,
    alias: string,
): Promise<AccountProfile> {
    const session = await ensureHostedSession(queryClient, input);
    const profile =
        queryClient.getQueryData<AccountProfile | null>(
            hostedQueryKeys.accountProfile(input.baseUrl, session.accountId),
        ) ?? session.accountProfile;
    if (!profile) {
        throw new Error("Hosted account profile unavailable");
    }

    try {
        const nextProfile = await input.hostedClient.updateAccountProfile(
            session.accessToken,
            {
                alias,
                expected_profile_version: profile.profile_version,
            },
        );
        await syncHostedProfileCaches(queryClient, input, session, nextProfile);
        return nextProfile;
    } catch (error) {
        if (error instanceof HostedAccountProfileConflictError) {
            await syncHostedProfileCaches(
                queryClient,
                input,
                session,
                error.currentProfile,
            );
            return error.currentProfile;
        }
        throw error;
    }
}

export async function syncHostedProfileCaches(
    queryClient: QueryClient,
    input: HostedAccountDependencies,
    session: { accountId: string; accountProfile: AccountProfile | null },
    profile: AccountProfile,
): Promise<void> {
    await cacheHostedAlias(queryClient, profile);
    queryClient.setQueryData(
        hostedQueryKeys.accountProfile(input.baseUrl, session.accountId),
        profile,
    );
    const currentSession = sessionQueryData(queryClient, input.baseUrl);
    if (currentSession && currentSession.accountId === session.accountId) {
        await setHostedSessionState(queryClient, input, {
            ...currentSession,
            accountProfile: profile,
        });
    }
    queryClient.setQueriesData(
        {
            queryKey: hostedQueryKeys.conduits(
                input.baseUrl,
                session.accountId,
            ),
        },
        (snapshot: { account?: AccountProfile } | undefined) => {
            if (!snapshot) {
                return snapshot;
            }
            return {
                ...snapshot,
                account: profile,
            };
        },
    );
}

function sessionQueryData(
    queryClient: QueryClient,
    baseUrl: string,
): import("@/src/hosted/sessionClient").HostedSession | null | undefined {
    return queryClient.getQueryData(hostedQueryKeys.session(baseUrl));
}

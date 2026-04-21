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
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";

import { syncHostedProfileCaches } from "@/src/hosted/accountQueries";
import { createHostedClient } from "@/src/hosted/client";
import { ConduitsSnapshot } from "@/src/hosted/contracts";
import { hostedQueryKeys } from "@/src/hosted/queryKeys";
import {
    HostedSessionDependencies,
    ensureHostedSession,
    useHostedSessionQuery,
} from "@/src/hosted/sessionQueries";

type HostedClient = ReturnType<typeof createHostedClient>;

export interface HostedConduitDependencies extends HostedSessionDependencies {
    hostedClient: HostedClient;
    isOnline?: boolean;
}

export function useHostedConduitsQuery(
    input: HostedConduitDependencies,
): UseQueryResult<ConduitsSnapshot | null> {
    const queryClient = useQueryClient();
    const sessionQuery = useHostedSessionQuery(input);

    return useQuery({
        queryKey: hostedQueryKeys.conduits(
            input.baseUrl,
            sessionQuery.data?.accountId ?? null,
        ),
        enabled: Boolean(
            input.baseUrl &&
                sessionQuery.data?.accountId &&
                input.isOnline !== false,
        ),
        retry: input.isOnline === false ? false : 3,
        queryFn: async () => fetchHostedConduitsSnapshot(queryClient, input),
        refetchOnReconnect: true,
        refetchInterval: (query) => {
            if (input.isOnline === false) {
                return false;
            }

            if (query.state.error) {
                return 10_000;
            }

            const snapshot = query.state.data as
                | ConduitsSnapshot
                | null
                | undefined;
            const pollAfterSeconds =
                snapshot?.poll_after_seconds ??
                snapshot?.conduits[0]?.poll_after_seconds ??
                null;
            return pollAfterSeconds == null ? false : pollAfterSeconds * 1000;
        },
    });
}

export async function fetchHostedConduitsSnapshot(
    queryClient: QueryClient,
    input: HostedConduitDependencies,
): Promise<ConduitsSnapshot> {
    const session = await ensureHostedSession(queryClient, input);
    const snapshot = await input.hostedClient.getConduitsSnapshot(
        session.accessToken,
    );
    if (snapshot.account) {
        await syncHostedProfileCaches(
            queryClient,
            input,
            session,
            snapshot.account,
        );
    }
    return snapshot;
}

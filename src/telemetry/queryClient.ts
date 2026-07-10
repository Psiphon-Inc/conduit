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
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import {
    recordClientEventError,
    summarizeClientEventKey,
} from "@/src/telemetry/clientEvents";

export function createAppQueryClient(): QueryClient {
    return new QueryClient({
        queryCache: new QueryCache({
            onError: (error, query) => {
                recordClientEventError("react_query.query_error", error, {
                    queryKey: summarizeClientEventKey(query.queryKey),
                    failureCount: query.state.fetchFailureCount,
                });
            },
        }),
        mutationCache: new MutationCache({
            onError: (error, _variables, _context, mutation) => {
                const mutationKey = mutation.options.mutationKey;
                recordClientEventError("react_query.mutation_error", error, {
                    mutationKey: mutationKey
                        ? summarizeClientEventKey(mutationKey)
                        : undefined,
                    failureCount: mutation.state.failureCount,
                });
            },
        }),
        defaultOptions: {
            queries: {
                networkMode: "always",
            },
        },
    });
}

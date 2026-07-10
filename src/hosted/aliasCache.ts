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
import { QueryClient } from "@tanstack/react-query";

import { loadCachedAlias } from "@/src/common/conduitAlias";
import * as secureStorage from "@/src/common/secureStorage";
import {
    QUERYKEY_CONDUIT_NAME,
    SECURESTORE_CONDUIT_NAME_KEY,
} from "@/src/constants";
import { AccountProfile } from "@/src/hosted/contracts";

// NOTE: This module intentionally shares the SECURESTORE_CONDUIT_NAME_KEY
// storage key with src/common/conduitAlias.ts so that aliases persisted by
// either the local or the hosted flow remain readable by both.
export async function cacheHostedAlias(
    queryClient: QueryClient,
    profileOrAlias: AccountProfile | string,
): Promise<void> {
    const alias =
        typeof profileOrAlias === "string"
            ? profileOrAlias
            : profileOrAlias.alias_is_default
              ? ""
              : profileOrAlias.alias;
    if (alias === "") {
        const cachedAlias = await loadCachedAlias();
        if (cachedAlias !== "") {
            queryClient.setQueryData([QUERYKEY_CONDUIT_NAME], cachedAlias);
            return;
        }
        await secureStorage.deleteItemAsync(SECURESTORE_CONDUIT_NAME_KEY);
    } else {
        await secureStorage.setItemAsync(SECURESTORE_CONDUIT_NAME_KEY, alias);
    }
    queryClient.setQueryData([QUERYKEY_CONDUIT_NAME], alias);
}

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
import * as SecureStore from "expo-secure-store";

import { migrateLegacyNickname } from "@/src/common/precis";
import {
    QUERYKEY_CONDUIT_NAME,
    SECURESTORE_CONDUIT_NAME_KEY,
} from "@/src/constants";
import { AccountProfile } from "@/src/hosted/contracts";

export async function loadCachedAlias(): Promise<string> {
    const alias =
        (await SecureStore.getItemAsync(SECURESTORE_CONDUIT_NAME_KEY)) ?? "";
    const migratedAlias = migrateLegacyNickname(alias);

    if (migratedAlias === alias) {
        return migratedAlias;
    }

    if (migratedAlias === "") {
        await SecureStore.deleteItemAsync(SECURESTORE_CONDUIT_NAME_KEY);
        return "";
    }

    await SecureStore.setItemAsync(SECURESTORE_CONDUIT_NAME_KEY, migratedAlias);
    return migratedAlias;
}

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
        await SecureStore.deleteItemAsync(SECURESTORE_CONDUIT_NAME_KEY);
    } else {
        await SecureStore.setItemAsync(SECURESTORE_CONDUIT_NAME_KEY, alias);
    }
    queryClient.setQueryData([QUERYKEY_CONDUIT_NAME], alias);
}

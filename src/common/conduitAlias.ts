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
import { migrateLegacyNickname } from "@/src/common/precis";
import * as secureStorage from "@/src/common/secureStorage";
import { SECURESTORE_CONDUIT_NAME_KEY } from "@/src/constants";

// NOTE: This module and src/hosted/aliasCache.ts intentionally share the
// SECURESTORE_CONDUIT_NAME_KEY storage key so that aliases persisted by
// either the local or the hosted flow remain readable by both.
export async function loadCachedAlias(): Promise<string> {
    const alias =
        (await secureStorage.getItemAsync(SECURESTORE_CONDUIT_NAME_KEY)) ?? "";
    const migratedAlias = migrateLegacyNickname(alias);

    if (migratedAlias === alias) {
        return migratedAlias;
    }

    if (migratedAlias === "") {
        await secureStorage.deleteItemAsync(SECURESTORE_CONDUIT_NAME_KEY);
        return "";
    }

    await secureStorage.setItemAsync(
        SECURESTORE_CONDUIT_NAME_KEY,
        migratedAlias,
    );
    return migratedAlias;
}

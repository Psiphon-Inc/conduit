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
 */
import * as SecureStore from "expo-secure-store";

import { SECURESTORE_CONDUIT_NAME_KEY } from "@/src/constants";
import { loadCachedAlias } from "@/src/hosted/aliasCache";

describe("loadCachedAlias", () => {
    beforeEach(() => {
        (
            SecureStore as typeof SecureStore & { __resetStore: () => void }
        ).__resetStore();
    });

    it("migrates a stored alias by removing disallowed characters", async () => {
        await SecureStore.setItemAsync(
            SECURESTORE_CONDUIT_NAME_KEY,
            "Legacy Alias!!!",
        );

        await expect(loadCachedAlias()).resolves.toBe("Legacy Alias");
        await expect(
            SecureStore.getItemAsync(SECURESTORE_CONDUIT_NAME_KEY),
        ).resolves.toBe("Legacy Alias");
    });

    it("clears a stored alias when it cannot be repaired into a valid nickname", async () => {
        await SecureStore.setItemAsync(SECURESTORE_CONDUIT_NAME_KEY, "@$");

        await expect(loadCachedAlias()).resolves.toBe("");
        await expect(
            SecureStore.getItemAsync(SECURESTORE_CONDUIT_NAME_KEY),
        ).resolves.toBeNull();
    });
});

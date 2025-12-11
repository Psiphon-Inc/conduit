/*
 * Copyright (c) 2024, Psiphon Inc.
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
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
    ASYNCSTORAGE_INPROXY_LIMIT_BYTES_PER_SECOND_KEY,
    ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY,
    ASYNCSTORAGE_STORAGE_VERSION_KEY,
    CURRENT_STORAGE_VERSION,
    DEFAULT_INPROXY_MAX_CLIENTS,
    V1_DEFAULT_INPROXY_MAX_CLIENTS,
} from "@/src/constants";
import { applyMigrations, version0To1, version1To2 } from "@/src/migrations";

describe("migrations", () => {
    it("0->1", async () => {
        // Applying the 0->1 migration in a fresh install is OK.
        await version0To1();

        expect(AsyncStorage.getItem).toHaveBeenCalledWith(
            ASYNCSTORAGE_INPROXY_LIMIT_BYTES_PER_SECOND_KEY,
        );
        expect(AsyncStorage.setItem).toHaveBeenCalledTimes(0);

        // Applying when bibytes are stored correctly updated to sibytes
        const bibytes = 20 * 1024 * 1024;
        const sibytes = 20 * 1000 * 1000;
        AsyncStorage.setItem(
            ASYNCSTORAGE_INPROXY_LIMIT_BYTES_PER_SECOND_KEY,
            bibytes.toString(),
        );

        await version0To1();

        expect(AsyncStorage.getItem).toHaveBeenCalledWith(
            ASYNCSTORAGE_INPROXY_LIMIT_BYTES_PER_SECOND_KEY,
        );
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(
            ASYNCSTORAGE_INPROXY_LIMIT_BYTES_PER_SECOND_KEY,
            sibytes.toString(),
        );
    });
    it("1->2", async () => {
        // Apply 1->2 migration, updates max clients
        await AsyncStorage.setItem(
            ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY,
            V1_DEFAULT_INPROXY_MAX_CLIENTS.toString(),
        );
        await version1To2();
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(
            ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY,
            DEFAULT_INPROXY_MAX_CLIENTS.toString(),
        );
    });
    it("1->2 custom max clients", async () => {
        // Apply 1->2 migration, does not update max clients
        await AsyncStorage.setItem(ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY, "3");
        // clear our call to setItem
        (AsyncStorage.setItem as jest.Mock).mockClear();

        await version1To2();
        expect(AsyncStorage.setItem).toHaveBeenCalledTimes(0);
    });
    it("applyMigrations", async () => {
        // Verify that the storageVersion is set to n after applying migrations
        const result = await applyMigrations();
        expect(result).toBe(CURRENT_STORAGE_VERSION);

        expect(
            AsyncStorage.setItem(
                ASYNCSTORAGE_STORAGE_VERSION_KEY,
                CURRENT_STORAGE_VERSION.toString(),
            ),
        );
    });
});

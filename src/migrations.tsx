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

import { wrapError } from "@/src/common/errors";
import { timedLog } from "@/src/common/utils";
import {
    ASYNCSTORAGE_INPROXY_LIMIT_BYTES_PER_SECOND_KEY,
    ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY,
    ASYNCSTORAGE_STORAGE_VERSION_KEY,
    DEFAULT_INPROXY_MAX_CLIENTS,
    V1_DEFAULT_INPROXY_MAX_CLIENTS,
} from "@/src/constants";

// The app stores a number of values in AsyncStorage and SecureStore. From time
// to time, it may be necessary to update or modify these stored values. These
// migrations will be implemented in this file.

export async function applyMigrations(): Promise<Error | number> {
    const storageVersionString = await AsyncStorage.getItem(
        ASYNCSTORAGE_STORAGE_VERSION_KEY,
    );
    let storageVersion: number;

    // default to 0 if no storageVersion was stored already.
    if (storageVersionString == null) {
        storageVersion = 0;
    } else {
        try {
            storageVersion = Number(storageVersionString);
        } catch (error) {
            return wrapError(
                error,
                `Invalid storageVersionString: ${storageVersionString}`,
            );
        }
    }

    // apply version 0 -> 1 migrations
    if (storageVersion == 0) {
        try {
            await version0To1();
        } catch (error) {
            return wrapError(error, "Unable to apply storage migration 0->1");
        }
        storageVersion = 1;
    }

    // apply version 1 -> 2 migrations
    if (storageVersion == 1) {
        try {
            await version1To2();
        } catch (error) {
            return wrapError(error, "Unable to apply storage migration 1->2");
        }
        storageVersion = 2;
    }

    await AsyncStorage.setItem(
        ASYNCSTORAGE_STORAGE_VERSION_KEY,
        storageVersion.toString(),
    );

    return storageVersion;
}

export async function version0To1(): Promise<void> {
    timedLog("Applying storage migrations 0->1");
    // The very first versions of the app incorrectly stored what was
    // reported as MB in the UI as MiB when converted to the total bytes
    // number, this has been fixed, but clients with an incorrectly stored
    // value should be updated from binary to SI bytes. This is implemented
    // below using % 1MB, as the UI uses MB for configuring this value.
    let storedInproxyLimitBytesPerSecond = await AsyncStorage.getItem(
        ASYNCSTORAGE_INPROXY_LIMIT_BYTES_PER_SECOND_KEY,
    );
    if (storedInproxyLimitBytesPerSecond !== null) {
        timedLog(`Stored limit ${storedInproxyLimitBytesPerSecond}`);
        let storedInproxyLimitBytesPerSecondNumber = Number(
            storedInproxyLimitBytesPerSecond,
        );
        const bibytesRemainder =
            storedInproxyLimitBytesPerSecondNumber % 1000000;
        if (bibytesRemainder != 0) {
            storedInproxyLimitBytesPerSecondNumber -= bibytesRemainder;
            storedInproxyLimitBytesPerSecond =
                storedInproxyLimitBytesPerSecondNumber.toString();
            timedLog("Converted stored binary bytes to si bytes");
        }
        await AsyncStorage.setItem(
            ASYNCSTORAGE_INPROXY_LIMIT_BYTES_PER_SECOND_KEY,
            storedInproxyLimitBytesPerSecond.toString(),
        );
    }
}

export async function version1To2(): Promise<void> {
    timedLog("Applying storage migrations 1->2");
    let storedInproxyMaxClients = await AsyncStorage.getItem(
        ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY,
    );
    if (Number(storedInproxyMaxClients) == V1_DEFAULT_INPROXY_MAX_CLIENTS) {
        timedLog(
            `Updating Max Clients from ${storedInproxyMaxClients} to ${DEFAULT_INPROXY_MAX_CLIENTS.toString()}`,
        );
        await AsyncStorage.setItem(
            ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY,
            DEFAULT_INPROXY_MAX_CLIENTS.toString(),
        );
    }
}

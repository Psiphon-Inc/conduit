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
import * as bip39 from "@scure/bip39";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english";
import * as SecureStore from "expo-secure-store";

import { createOrLoadAccount } from "@/src/auth/account";
import {
    SECURESTORE_ACCOUNT_KEYPAIR_BASE64_KEY,
    SECURESTORE_DEVICE_NONCE_KEY,
    SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
    SECURESTORE_MNEMONIC_KEY,
} from "@/src/constants";

describe("account", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-expect-error - Mock method for testing, see jestSetup.js
        SecureStore.__resetStore();
    });

    it("createOrLoadAccount fresh account", async () => {
        const account = await createOrLoadAccount();
        expect(account).not.toBeInstanceOf(Error);
        expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(5);
        expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(5);

        const rwKeysToCheck = [
            SECURESTORE_MNEMONIC_KEY,
            SECURESTORE_ACCOUNT_KEYPAIR_BASE64_KEY,
            SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
            SECURESTORE_DEVICE_NONCE_KEY,
        ];

        for (const key of rwKeysToCheck) {
            expect(SecureStore.getItemAsync).toHaveBeenCalledWith(key);
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
                key,
                expect.any(String),
            );
        }
    });

    it("createOrLoadAccount existing acount from mnemonic", async () => {
        // Pre-load the mnemonic
        const mnemonic = bip39.generateMnemonic(englishWordlist);
        await SecureStore.setItemAsync(SECURESTORE_MNEMONIC_KEY, mnemonic);
        jest.clearAllMocks(); // forget about the write we just did

        // Load the account, since we have mnemonic it should be re-used
        const account = await createOrLoadAccount();

        expect(account).not.toBeInstanceOf(Error);
        expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(5);
        expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(4);

        expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(
            SECURESTORE_MNEMONIC_KEY,
            expect.any(String),
        );

        const rwKeysToCheck = [
            SECURESTORE_ACCOUNT_KEYPAIR_BASE64_KEY,
            SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
            SECURESTORE_DEVICE_NONCE_KEY,
        ];

        for (const key of rwKeysToCheck) {
            expect(SecureStore.getItemAsync).toHaveBeenCalledWith(key);
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
                key,
                expect.any(String),
            );
        }
    });

    it("createOrLoadAccount existing account", async () => {
        // Create the account, since we have mnemonic it should be re-used
        const account = await createOrLoadAccount();
        expect(account).not.toBeInstanceOf(Error);
        jest.clearAllMocks(); // forget all the calls during create

        const accountLoaded = await createOrLoadAccount();
        expect(accountLoaded).not.toBeInstanceOf(Error);
        expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(5);
        expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(0);

        const rKeysToCheck = [
            SECURESTORE_MNEMONIC_KEY,
            SECURESTORE_ACCOUNT_KEYPAIR_BASE64_KEY,
            SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
            SECURESTORE_DEVICE_NONCE_KEY,
        ];

        for (const key of rKeysToCheck) {
            expect(SecureStore.getItemAsync).toHaveBeenCalledWith(key);
        }
    });
});

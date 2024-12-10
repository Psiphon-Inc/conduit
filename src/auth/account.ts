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
import { z } from "zod";

import {
    Ed25519KeyPair,
    Ed25519KeyPairSchema,
    base64nopadToKeyPair,
    deriveEd25519KeyPair,
    keyPairToBase64nopad,
} from "@/src/common/cryptography";
import { wrapError } from "@/src/common/errors";
import { timedLog } from "@/src/common/utils";
import {
    Base64Unpadded32Bytes,
    Base64Unpadded32BytesSchema,
} from "@/src/common/validators";
import {
    SECURESTORE_ACCOUNT_KEYPAIR_BASE64_KEY,
    SECURESTORE_DEVICE_NONCE_KEY,
    SECURESTORE_INPROXY_COMPARTMENT_ID,
    SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
    SECURESTORE_MNEMONIC_KEY,
} from "@/src/constants";
import { formatConduitBip32Path } from "@/src/inproxy/utils";
import { base64nopad } from "@scure/base";

// An "Account" is a collection of key material
const AccountSchema = z.object({
    mnemonic: z.string(),
    accountKey: Ed25519KeyPairSchema,
    deviceNonce: z.number(),
    inproxyKey: Ed25519KeyPairSchema,
    inproxyCompartmentId: Base64Unpadded32BytesSchema,
});

export type Account = z.infer<typeof AccountSchema>;

/**
 * createOrLoadAccount will first look in SecureStore for saved account keys,
 * and generate new account keys if none are found. Any newly generated material
 * will be persisted by this method.
 */
export async function createOrLoadAccount(): Promise<Account | Error> {
    try {
        // Load mnemonic
        let mnemonic: string;
        const storedMnemonic = await SecureStore.getItemAsync(
            SECURESTORE_MNEMONIC_KEY,
        );
        if (!storedMnemonic) {
            timedLog("Generating new root mnemonic");
            const newMnemonic = bip39.generateMnemonic(englishWordlist);
            await SecureStore.setItemAsync(
                SECURESTORE_MNEMONIC_KEY,
                newMnemonic,
            );
            mnemonic = newMnemonic;
        } else {
            mnemonic = storedMnemonic;
        }

        // Load account key
        let accountKey: Ed25519KeyPair;
        const storedAccountKeyPairBase64nopad = await SecureStore.getItemAsync(
            SECURESTORE_ACCOUNT_KEYPAIR_BASE64_KEY,
        );
        if (!storedAccountKeyPairBase64nopad) {
            timedLog("Deriving account key from root mnemonic");
            const derived = deriveEd25519KeyPair(mnemonic);
            if (derived instanceof Error) {
                throw derived;
            }
            const accountKeyPairBase64nopad = keyPairToBase64nopad(derived);
            if (accountKeyPairBase64nopad instanceof Error) {
                throw derived;
            }
            await SecureStore.setItemAsync(
                SECURESTORE_ACCOUNT_KEYPAIR_BASE64_KEY,
                accountKeyPairBase64nopad,
            );
            accountKey = derived;
        } else {
            const storedAccountKeyPair = base64nopadToKeyPair(
                storedAccountKeyPairBase64nopad,
            );
            if (storedAccountKeyPair instanceof Error) {
                throw storedAccountKeyPair;
            }
            accountKey = storedAccountKeyPair;
        }

        // Load device nonce
        let deviceNonce: number;
        const storedDeviceNonce = await SecureStore.getItemAsync(
            SECURESTORE_DEVICE_NONCE_KEY,
        );
        if (!storedDeviceNonce) {
            timedLog("Picking new random device nonce");
            const newDeviceNonce = Math.floor(Math.random() * 0x80000000);
            await SecureStore.setItemAsync(
                SECURESTORE_DEVICE_NONCE_KEY,
                newDeviceNonce.toString(),
            );
            deviceNonce = newDeviceNonce;
        } else {
            deviceNonce = parseInt(storedDeviceNonce);
        }

        // Load inproxy key
        let inproxyKey: Ed25519KeyPair;
        const storedConduitKeyPairBase64nopad = await SecureStore.getItemAsync(
            SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
        );
        if (!storedConduitKeyPairBase64nopad) {
            timedLog("Deriving new conduit key pair from root mnemonic");
            const derived = deriveEd25519KeyPair(
                mnemonic,
                formatConduitBip32Path(deviceNonce),
            );
            if (derived instanceof Error) {
                throw derived;
            }
            const inproxyKeyPairBase64nopad = keyPairToBase64nopad(derived);
            if (inproxyKeyPairBase64nopad instanceof Error) {
                throw inproxyKeyPairBase64nopad;
            }
            await SecureStore.setItemAsync(
                SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
                inproxyKeyPairBase64nopad,
            );
            inproxyKey = derived;
        } else {
            const storedInproxyKeyPair = base64nopadToKeyPair(
                storedConduitKeyPairBase64nopad,
            );
            if (storedInproxyKeyPair instanceof Error) {
                throw storedInproxyKeyPair;
            }
            inproxyKey = storedInproxyKeyPair;
        }

        // Load Compartment ID
        let inproxyCompartmentId: Base64Unpadded32Bytes;
        const storedInproxyCompartmentId = await SecureStore.getItemAsync(
            SECURESTORE_INPROXY_COMPARTMENT_ID,
        );
        if (!storedInproxyCompartmentId) {
            timedLog("Generating a new random compartment Id");
            const randomBytes = crypto.getRandomValues(new Uint8Array(32));
            inproxyCompartmentId = base64nopad.encode(randomBytes);
            await SecureStore.setItemAsync(
                SECURESTORE_INPROXY_COMPARTMENT_ID,
                inproxyCompartmentId,
            );
        } else {
            inproxyCompartmentId = storedInproxyCompartmentId;
        }
        return AccountSchema.parse({
            mnemonic: mnemonic,
            accountKey: accountKey,
            deviceNonce: deviceNonce,
            inproxyKey: inproxyKey,
            inproxyCompartmentId: inproxyCompartmentId,
        });
    } catch (error) {
        return wrapError(error, "Error signing in");
    }
}

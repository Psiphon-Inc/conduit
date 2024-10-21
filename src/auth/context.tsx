import * as bip39 from "@scure/bip39";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english";
import { useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import React from "react";

import {
    base64nopadToKeyPair,
    deriveEd25519KeyPair,
    keyPairToBase64nopad,
} from "@/src/common/cryptography";
import { wrapError } from "@/src/common/errors";
import { formatConduitBip32Path } from "@/src/inproxy/utils";

import {
    QUERYKEY_ACCOUNT_KEYPAIR,
    QUERYKEY_INPROXY_KEYPAIR,
    SECURESTORE_ACCOUNT_KEYPAIR_BASE64_KEY,
    SECURESTORE_DEVICE_NONCE_KEY,
    SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
    SECURESTORE_MNEMONIC_KEY,
} from "@/src/constants";

export interface AuthContextValue {
    signIn: () => Promise<null | Error>;
    deleteAccount: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/**
 * The AuthContext is used to persist and access the user's BIP39 mnemonic.
 * The mnemonic and the keys/account it derives are provided to the rest of the
 * app via the AccountContext. Use this hook for sign in, out, and deleting the
 * account. Use `useAccountContext` to access the mnemonic and derived values.
 */
export function useAuthContext() {
    const value = React.useContext(AuthContext);
    if (!value) {
        throw new Error("useAuthContext must be wrapped in a <AuthProvider />");
    }

    return value;
}

export function AuthProvider(props: React.PropsWithChildren) {
    const queryClient = useQueryClient();

    async function signIn() {
        try {
            let mnemonic: string;
            // Load mnemonic
            const storedMnemonic = await SecureStore.getItemAsync(
                SECURESTORE_MNEMONIC_KEY,
            );
            if (!storedMnemonic) {
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
            const storedAccountKeyPairBase64nopad =
                await SecureStore.getItemAsync(
                    SECURESTORE_ACCOUNT_KEYPAIR_BASE64_KEY,
                );
            if (!storedAccountKeyPairBase64nopad) {
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
                queryClient.setQueryData([QUERYKEY_ACCOUNT_KEYPAIR], derived);
            } else {
                const storedAccountKeyPair = base64nopadToKeyPair(
                    storedAccountKeyPairBase64nopad,
                );
                if (storedAccountKeyPair instanceof Error) {
                    throw storedAccountKeyPair;
                }
                queryClient.setQueryData(
                    [QUERYKEY_ACCOUNT_KEYPAIR],
                    storedAccountKeyPair,
                );
            }

            // Load device nonce
            let deviceNonce: number;
            const storedDeviceNonce = await SecureStore.getItemAsync(
                SECURESTORE_DEVICE_NONCE_KEY,
            );
            if (!storedDeviceNonce) {
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
            const storedConduitKeyPairBase64nopad =
                await SecureStore.getItemAsync(
                    SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
                );
            if (!storedConduitKeyPairBase64nopad) {
                const derived = deriveEd25519KeyPair(
                    mnemonic,
                    formatConduitBip32Path(deviceNonce),
                );
                if (derived instanceof Error) {
                    throw derived;
                }
                const conduitKeyPairBase64nopad = keyPairToBase64nopad(derived);
                if (conduitKeyPairBase64nopad instanceof Error) {
                    throw conduitKeyPairBase64nopad;
                }
                await SecureStore.setItemAsync(
                    SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
                    conduitKeyPairBase64nopad,
                );
                queryClient.setQueryData([QUERYKEY_INPROXY_KEYPAIR], derived);
            } else {
                const storedConduitKeyPair = base64nopadToKeyPair(
                    storedConduitKeyPairBase64nopad,
                );
                if (storedConduitKeyPair instanceof Error) {
                    throw storedConduitKeyPair;
                }
                queryClient.setQueryData(
                    [QUERYKEY_INPROXY_KEYPAIR],
                    storedConduitKeyPair,
                );
            }
        } catch (error) {
            return wrapError(error, "Error signing in");
        }
    }

    async function deleteAccount() {
        await SecureStore.deleteItemAsync(SECURESTORE_MNEMONIC_KEY);
        await SecureStore.deleteItemAsync(
            SECURESTORE_ACCOUNT_KEYPAIR_BASE64_KEY,
        );
        await SecureStore.deleteItemAsync(SECURESTORE_DEVICE_NONCE_KEY);
        await SecureStore.deleteItemAsync(
            SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
        );
    }

    const value = {
        signIn,
        deleteAccount,
    } as AuthContextValue;

    return (
        <AuthContext.Provider value={value}>
            {props.children}
        </AuthContext.Provider>
    );
}

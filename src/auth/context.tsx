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
            // Load mnemonic from SecureStore
            const storedMnemonic = await SecureStore.getItemAsync("mnemonic");
            if (!storedMnemonic) {
                const newMnemonic = bip39.generateMnemonic(englishWordlist);
                await SecureStore.setItemAsync("mnemonic", newMnemonic);
                mnemonic = newMnemonic;
            } else {
                mnemonic = storedMnemonic;
            }

            // Load device nonce from SecureStore
            let deviceNonce: number;
            const storedDeviceNonce =
                await SecureStore.getItemAsync("deviceNonce");
            if (!storedDeviceNonce) {
                const newDeviceNonce = Math.floor(Math.random() * 0x80000000);
                await SecureStore.setItemAsync(
                    "deviceNonce",
                    newDeviceNonce.toString(),
                );
                deviceNonce = newDeviceNonce;
            } else {
                deviceNonce = parseInt(storedDeviceNonce);
            }
            const storedConduitKeyPairBase64nopad =
                await SecureStore.getItemAsync("conduitKeyPairBase64nopad");
            if (!storedConduitKeyPairBase64nopad) {
                const derived = deriveEd25519KeyPair(
                    mnemonic,
                    formatConduitBip32Path(deviceNonce),
                );
                if (derived instanceof Error) {
                    throw derived;
                }
                const conduitKeyPairBase64NoPad = keyPairToBase64nopad(derived);
                if (conduitKeyPairBase64NoPad instanceof Error) {
                    throw conduitKeyPairBase64NoPad;
                }
                await SecureStore.setItemAsync(
                    "conduitKeyPairBase64nopad",
                    conduitKeyPairBase64NoPad,
                );
                queryClient.setQueryData(["conduitKeyPair"], derived);
            } else {
                const storedConduitKeyPair = base64nopadToKeyPair(
                    storedConduitKeyPairBase64nopad,
                );
                if (storedConduitKeyPair instanceof Error) {
                    throw storedConduitKeyPair;
                }
                queryClient.setQueryData(
                    ["conduitKeyPair"],
                    storedConduitKeyPair,
                );
            }
        } catch (error) {
            return wrapError(error, "Error signing in");
        }
    }

    async function deleteAccount() {
        await SecureStore.deleteItemAsync("mnemonic");
        await SecureStore.deleteItemAsync("deviceNonce");
        await SecureStore.deleteItemAsync("conduitKeyPairBase64nopad");
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

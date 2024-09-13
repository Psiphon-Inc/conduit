import * as bip39 from "@scure/bip39";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english";
import * as SecureStore from "expo-secure-store";
import React, { useCallback } from "react";

import { wrapError } from "@/src/common/errors";

export interface AuthContextValue {
    signIn: () => Promise<null | Error>;
    signOut: () => void;
    deleteAccount: () => void;
    mnemonic?: string | null;
    deviceNonce?: number | null;
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
    const [mnemonic, setMnemonic] = React.useState<string | null>(null);
    const [deviceNonce, setDeviceNonce] = React.useState<number | null>(null);

    const signIn = React.useCallback(async () => {
        try {
            // Load mnemonic from SecureStore
            const storedMnemonic = await SecureStore.getItemAsync("mnemonic");
            if (!storedMnemonic) {
                const newMnemonic = bip39.generateMnemonic(englishWordlist);
                await SecureStore.setItemAsync("mnemonic", newMnemonic);
                setMnemonic(newMnemonic);
            } else {
                setMnemonic(storedMnemonic);
            }

            // Load device nonce from SecureStore
            const storedDeviceNonce =
                await SecureStore.getItemAsync("deviceNonce");
            if (!storedDeviceNonce) {
                const newDeviceNonce = Math.floor(Math.random() * 0x80000000);
                await SecureStore.setItemAsync(
                    "deviceNonce",
                    newDeviceNonce.toString(),
                );
                setDeviceNonce(newDeviceNonce);
            } else {
                setDeviceNonce(parseInt(storedDeviceNonce));
            }
        } catch (error) {
            return wrapError(error, "Error signing in");
        }

        return null;
    }, [setMnemonic]);

    const signOut = useCallback(() => {
        setMnemonic(null);
    }, [setMnemonic]);

    const deleteAccount = useCallback(async () => {
        await SecureStore.deleteItemAsync("mnemonic");
        signOut();
    }, [signOut]);

    const value = {
        signIn,
        signOut,
        deleteAccount,
        mnemonic,
        deviceNonce,
    } as AuthContextValue;

    return (
        <AuthContext.Provider value={value}>
            {props.children}
        </AuthContext.Provider>
    );
}

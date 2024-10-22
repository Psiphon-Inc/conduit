import { useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import React from "react";

import { createOrLoadAccount } from "@/src/auth/account";
import {
    QUERYKEY_ACCOUNT_KEYPAIR,
    QUERYKEY_INPROXY_KEYPAIR,
    SECURESTORE_ACCOUNT_KEYPAIR_BASE64_KEY,
    SECURESTORE_DEVICE_NONCE_KEY,
    SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY,
    SECURESTORE_MNEMONIC_KEY,
} from "@/src/constants";

export interface AuthContextValue {
    signIn: () => Promise<void | Error>;
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
        const account = await createOrLoadAccount();

        if (account instanceof Error) {
            return account;
        }

        // expose the account keys to the rest of the app through useQuery
        queryClient.setQueryData(
            [QUERYKEY_ACCOUNT_KEYPAIR],
            account.accountKey,
        );
        queryClient.setQueryData(
            [QUERYKEY_INPROXY_KEYPAIR],
            account.inproxyKey,
        );
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
        queryClient.setQueryData([QUERYKEY_ACCOUNT_KEYPAIR], null);
        queryClient.setQueryData([QUERYKEY_INPROXY_KEYPAIR], null);
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

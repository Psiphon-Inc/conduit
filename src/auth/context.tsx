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
import { useQueryClient } from "@tanstack/react-query";
import React from "react";

import { createOrLoadAccount } from "@/src/auth/account";
import { timedLog } from "@/src/common/utils";
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
        timedLog("Setting keys in queryData");
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
        await AsyncStorage.removeItem(SECURESTORE_MNEMONIC_KEY);
        await AsyncStorage.removeItem(SECURESTORE_ACCOUNT_KEYPAIR_BASE64_KEY);
        await AsyncStorage.removeItem(SECURESTORE_DEVICE_NONCE_KEY);
        await AsyncStorage.removeItem(SECURESTORE_INPROXY_KEYPAIR_BASE64_KEY);
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

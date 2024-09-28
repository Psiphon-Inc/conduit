import { useQuery, UseQueryResult } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import React from "react";

import {
    base64nopadToKeyPair,
    deriveEd25519KeyPair,
    Ed25519KeyPair,
    keyPairToBase64nopad,
} from "@/src/common/cryptography";
import { formatConduitBip32Path } from "@/src/inproxy/utils";

export interface AccountContextValue {
    conduitKeyPair: UseQueryResult<Ed25519KeyPair>;
}

const AccountContext = React.createContext<AccountContextValue | null>(null);

/**
 * A Conduit account is defined by a BIP-39 Mnemonic and a derived Ed25519 key.
 * The key derivation function uses a device nonce to support multiple conduits
 * per account, though this multi-device functionality is not yet implemented.
 * This context provides these values to authenticated routes within the app.
 * Establishing authentication state is handled by `useAuthContext`.
 */
export function useAccountContext() {
    const value = React.useContext(AccountContext);
    if (!value) {
        throw new Error(
            "useAccountContext must be wrapped in a <AccountProvider />",
        );
    }

    return value;
}

export function AccountProvider({
    mnemonic,
    deviceNonce,
    children,
}: {
    mnemonic: string;
    deviceNonce: number;
    children: React.ReactNode;
}) {
    async function retrieveConduitKeyPair() {
        // TODO: store in asyncstorage to save startup time
        const storedConduitKeyPairBase64nopad = await SecureStore.getItemAsync(
            "conduitKeyPairBase64nopad",
        );
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
            return derived;
        } else {
            const storedConduitKeyPair = base64nopadToKeyPair(
                storedConduitKeyPairBase64nopad,
            );
            if (storedConduitKeyPair instanceof Error) {
                throw storedConduitKeyPair;
            }
            return storedConduitKeyPair;
        }
    }

    const conduitKeyPair = useQuery({
        queryKey: ["conduitKeyPair"],
        queryFn: retrieveConduitKeyPair,
        refetchInterval: -1,
    });

    const value = {
        conduitKeyPair,
    } as AccountContextValue;

    return (
        <AccountContext.Provider value={value}>
            {children}
        </AccountContext.Provider>
    );
}

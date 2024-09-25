import React from "react";

import {
    Ed25519KeyPair,
    deriveEd25519KeyPair,
} from "@/src/common/cryptography";
import { formatConduitBip32Path } from "@/src/inproxy/utils";

export interface AccountContextValue {
    conduitKeyPair: Ed25519KeyPair;
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
    const conduitKeyPair = React.useMemo(() => {
        // TODO: store in asyncstorage to save startup time
        const derived = deriveEd25519KeyPair(
            mnemonic,
            formatConduitBip32Path(deviceNonce),
        );
        if (derived instanceof Error) {
            throw derived;
        }
        return derived;
    }, [mnemonic]);

    const value = {
        conduitKeyPair,
    } as AccountContextValue;

    return (
        <AccountContext.Provider value={value}>
            {children}
        </AccountContext.Provider>
    );
}

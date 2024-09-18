import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";

import {
    Ed25519KeyPair,
    deriveEd25519KeyPair,
    keyPairToBase64nopad,
} from "@/src/common/cryptography";
import { handleError, wrapError } from "@/src/common/errors";
import {
    DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
    DEFAULT_INPROXY_MAX_CLIENTS,
} from "@/src/constants";
// TODO: pending new psiphon module
//import { useInProxyContext } from "@/src/psiphon/context";
import {
    InProxyParametersSchema,
    formatConduitBip32Path,
} from "@/src/psiphon/inproxy";
import { useInProxyContext } from "@/src/psiphon/mockContext";

export interface AccountContextValue {
    rootKeyPair: Ed25519KeyPair;
    conduitKeyPair: Ed25519KeyPair;
}

const AccountContext = React.createContext<AccountContextValue | null>(null);

/**
 * A Ryve account is defined by a BIP-39 Mnemonic, the associated blockchain
 * account, and an Ed25519 key pair. The mnemonic is used to derive the rest of
 * the account information.
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
    const rootKeyPair = React.useMemo(() => {
        const derived = deriveEd25519KeyPair(mnemonic);
        if (derived instanceof Error) {
            throw derived;
        }
        return derived;
    }, [mnemonic]);

    const conduitKeyPair = React.useMemo(() => {
        const derived = deriveEd25519KeyPair(
            mnemonic,
            formatConduitBip32Path(deviceNonce),
        );
        if (derived instanceof Error) {
            throw derived;
        }
        return derived;
    }, [mnemonic]);

    // TODO: pending new psiphon module
    const { selectInProxyParameters } = useInProxyContext();

    // We store the user-controllable InProxy settings in AsyncStorage, so that
    // they can be persisted at the application layer instead of only at the VPN
    // module layer. This also allows us to have defaults that are different
    // than what the module uses. The values stored in AsyncStorage will be
    // taken as the source of truth.
    async function loadInProxyParameters() {
        try {
            // Retrieve stored inproxy parameters from the application layer
            const storedInProxyMaxClients =
                await AsyncStorage.getItem("InProxyMaxClients");

            const storedInProxyLimitBytesPerSecond = await AsyncStorage.getItem(
                "InProxyLimitBytesPerSecond",
            );

            // Prepare the stored/default parameters from the application layer
            const storedInProxyParameters = InProxyParametersSchema.parse({
                privateKey: keyPairToBase64nopad(conduitKeyPair),
                maxClients: storedInProxyMaxClients
                    ? parseInt(storedInProxyMaxClients)
                    : DEFAULT_INPROXY_MAX_CLIENTS,
                limitUpstreamBytesPerSecond: storedInProxyLimitBytesPerSecond
                    ? parseInt(storedInProxyLimitBytesPerSecond)
                    : DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
                limitDownstreamBytesPerSecond: storedInProxyLimitBytesPerSecond
                    ? parseInt(storedInProxyLimitBytesPerSecond)
                    : DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
            });

            // sets the inproxy parameters in the psiphon module. This call
            // also updates the context's state value for the inproxy
            // parameters, so an explicit call to sync them is not needed.
            // TODO: pending new psiphon module
            await selectInProxyParameters(storedInProxyParameters);

            // Write the defaults to AsyncStorage if they aren't there
            if (!storedInProxyMaxClients) {
                await AsyncStorage.setItem(
                    "InProxyMaxClients",
                    storedInProxyParameters.maxClients.toString(),
                );
            }
            if (!storedInProxyLimitBytesPerSecond) {
                await AsyncStorage.setItem(
                    "InProxyLimitBytesPerSecond",
                    storedInProxyParameters.limitUpstreamBytesPerSecond.toString(),
                );
            }
        } catch (error) {
            handleError(wrapError(error, "Failed to load inproxy parameters"));
        }
    }

    // Loads InProxy parameters on first mount. This is done in the account
    // context because it is the first place where the conduitKeyPair is ready.
    // It could be done in the psiphon context, but this would require some
    // refactoring of the order of the context providers in the app.
    React.useEffect(() => {
        // Note that right now, this means that we ALWAYS set the InProxy params
        // in the module on app start, even if they have not changed. This could
        // be made more precise by having this effect depend on the InProxy
        // params stored in the psiphon vpn context, but since these values are
        // currently stored as an object the context would need to expose state
        // values that we can use in this dependency array that don't have the
        // pitfals of objects as dependencies (hence why this doesn't just use
        // inProxyParameters as a dependency).
        // https://react.dev/learn/removing-effect-dependencies#does-some-reactive-value-change-unintentionally
        loadInProxyParameters();
    }, []);

    const value = {
        rootKeyPair,
        conduitKeyPair,
    } as AccountContextValue;

    return (
        <AccountContext.Provider value={value}>
            {children}
        </AccountContext.Provider>
    );
}

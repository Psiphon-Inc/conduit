/*
 * Copyright (c) 2026, Psiphon Inc.
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
import { ClerkProvider } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import React from "react";

import {
    readHostedClerkPublishableKey,
    useHostedClerkAuthService,
} from "@/src/hosted/auth/clerk";
import { createStubHostedAuthService } from "@/src/hosted/auth/service";
import type { HostedAuthService } from "@/src/hosted/auth/types";

const HostedAuthServiceContext = React.createContext<HostedAuthService | null>(
    null,
);

export function HostedAuthProvider(props: React.PropsWithChildren) {
    const publishableKey = readHostedClerkPublishableKey();
    if (!publishableKey) {
        return (
            <HostedAuthServiceContext.Provider
                value={createStubHostedAuthService()}
            >
                {props.children}
            </HostedAuthServiceContext.Provider>
        );
    }

    return (
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
            <HostedAuthServiceProviderWithClerk>
                {props.children}
            </HostedAuthServiceProviderWithClerk>
        </ClerkProvider>
    );
}

export function useOptionalHostedAuthService(): HostedAuthService | null {
    return React.useContext(HostedAuthServiceContext);
}

function HostedAuthServiceProviderWithClerk(props: React.PropsWithChildren) {
    const authService = useHostedClerkAuthService();
    return (
        <HostedAuthServiceContext.Provider value={authService}>
            {props.children}
        </HostedAuthServiceContext.Provider>
    );
}

const tokenCache = {
    getToken: async (key: string): Promise<string | null> =>
        SecureStore.getItemAsync(key),
    saveToken: async (key: string, value: string): Promise<void> => {
        await SecureStore.setItemAsync(key, value);
    },
};

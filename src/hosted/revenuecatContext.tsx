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
import React from "react";
import {
    CustomerInfo,
    CustomerInfoUpdateListener,
    PurchasesOfferings,
    PurchasesPackage,
} from "react-native-purchases";

import {
    RevenueCatClient,
    RevenueCatConfigureInput,
    RevenueCatPublicKeys,
    RevenueCatPurchaseResult,
    RevenueCatRestoreResult,
    createRevenueCatClient,
} from "@/src/hosted/revenuecatClient";

export interface RevenueCatInitializeInput {
    publicKeys: RevenueCatPublicKeys;
    accountId?: string;
    platformOs?: string;
}

export interface RevenueCatContextValue {
    customerInfo: CustomerInfo | null;
    configure(input: RevenueCatConfigureInput): void;
    initialize(input: RevenueCatInitializeInput): Promise<CustomerInfo>;
    logIn(accountId: string): Promise<CustomerInfo>;
    refreshCustomerInfo(): Promise<CustomerInfo>;
    getOfferings(): Promise<PurchasesOfferings>;
    restorePurchases(): Promise<RevenueCatRestoreResult>;
    purchasePackage(
        aPackage: PurchasesPackage,
    ): Promise<RevenueCatPurchaseResult>;
}

const RevenueCatContext = React.createContext<RevenueCatContextValue | null>(
    null,
);

export function useRevenueCatContext(): RevenueCatContextValue {
    const value = React.useContext(RevenueCatContext);
    if (!value) {
        throw new Error(
            "useRevenueCatContext must be wrapped in a <RevenueCatProvider />",
        );
    }

    return value;
}

export interface RevenueCatProviderProps extends React.PropsWithChildren {
    client?: RevenueCatClient;
}

export function RevenueCatProvider(props: RevenueCatProviderProps) {
    const client = React.useMemo(
        () => props.client ?? createRevenueCatClient(),
        [props.client],
    );
    const [customerInfo, setCustomerInfo] = React.useState<CustomerInfo | null>(
        null,
    );

    React.useEffect(() => {
        const listener: CustomerInfoUpdateListener = (nextCustomerInfo) => {
            setCustomerInfo(nextCustomerInfo);
        };
        return client.addCustomerInfoListener(listener);
    }, [client]);

    async function logIn(accountId: string): Promise<CustomerInfo> {
        const nextCustomerInfo = await client.logIn(accountId);
        setCustomerInfo(nextCustomerInfo);
        return nextCustomerInfo;
    }

    async function initialize(
        input: RevenueCatInitializeInput,
    ): Promise<CustomerInfo> {
        client.configure({
            publicKeys: input.publicKeys,
            platformOs: input.platformOs,
        });

        if (input.accountId) {
            const nextCustomerInfo = await client.logIn(input.accountId);
            setCustomerInfo(nextCustomerInfo);
            return nextCustomerInfo;
        }

        const nextCustomerInfo = await client.getCustomerInfo();
        setCustomerInfo(nextCustomerInfo);
        return nextCustomerInfo;
    }

    async function refreshCustomerInfo(): Promise<CustomerInfo> {
        const nextCustomerInfo = await client.getCustomerInfo();
        setCustomerInfo(nextCustomerInfo);
        return nextCustomerInfo;
    }

    async function getOfferings(): Promise<PurchasesOfferings> {
        return client.getOfferings();
    }

    async function restorePurchases(): Promise<RevenueCatRestoreResult> {
        const result = await client.restorePurchases();
        setCustomerInfo(result.customerInfo);
        return result;
    }

    async function purchasePackage(
        aPackage: PurchasesPackage,
    ): Promise<RevenueCatPurchaseResult> {
        const result = await client.purchasePackage(aPackage);
        setCustomerInfo(result.customerInfo);
        return result;
    }

    const value: RevenueCatContextValue = {
        customerInfo,
        configure: client.configure,
        initialize,
        logIn,
        refreshCustomerInfo,
        getOfferings,
        restorePurchases,
        purchasePackage,
    };

    return (
        <RevenueCatContext.Provider value={value}>
            {props.children}
        </RevenueCatContext.Provider>
    );
}

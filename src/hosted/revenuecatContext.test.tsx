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
import type {
    CustomerInfo,
    CustomerInfoUpdateListener,
    PurchasesPackage,
} from "react-native-purchases";
import { ReactTestRenderer, act, create } from "react-test-renderer";

import type { RevenueCatClient } from "@/src/hosted/revenuecatClient";
import {
    RevenueCatProvider,
    useRevenueCatContext,
} from "@/src/hosted/revenuecatContext";
import type { RevenueCatContextValue } from "@/src/hosted/revenuecatContext";

describe("revenuecat context", () => {
    it("throws when hook is used outside provider", () => {
        function BrokenConsumer() {
            useRevenueCatContext();
            return null;
        }

        expect(() => {
            act(() => {
                create(<BrokenConsumer />);
            });
        }).toThrow(
            "useRevenueCatContext must be wrapped in a <RevenueCatProvider />",
        );
    });

    it("subscribes and unsubscribes to customer info updates", () => {
        const customerInfo = makeCustomerInfo("acc_listener");
        const unsubscribe = jest.fn();
        const client = makeClient({
            getCustomerInfo: jest.fn().mockResolvedValue(customerInfo),
            addCustomerInfoListener: jest.fn().mockReturnValue(unsubscribe),
        });

        let renderer: ReactTestRenderer | null = null;
        act(() => {
            renderer = create(
                <RevenueCatProvider client={client}>
                    <React.Fragment />
                </RevenueCatProvider>,
            );
        });

        expect(client.addCustomerInfoListener).toHaveBeenCalledTimes(1);

        act(() => {
            renderer?.unmount();
        });
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("exposes initialize and mutating operations", async () => {
        const customerInfoA = makeCustomerInfo("acc_a");
        const customerInfoB = makeCustomerInfo("acc_b");
        const customerInfoC = makeCustomerInfo("acc_c");
        const customerInfoD = makeCustomerInfo("acc_d");
        const customerInfoE = makeCustomerInfo("acc_e");
        const client = makeClient({
            logIn: jest.fn().mockResolvedValue(customerInfoB),
            getCustomerInfo: jest.fn().mockResolvedValue(customerInfoA),
            restorePurchases: jest
                .fn()
                .mockResolvedValue({ customerInfo: customerInfoC }),
            purchasePackage: jest.fn().mockResolvedValue({
                customerInfo: customerInfoD,
                productIdentifier: "test.product.primary",
            }),
            addCustomerInfoListener: jest
                .fn()
                .mockImplementation((listener: CustomerInfoUpdateListener) => {
                    listener(customerInfoE);
                    return jest.fn();
                }),
        });

        let contextValue: RevenueCatContextValue | null = null;
        function Consumer() {
            contextValue = useRevenueCatContext();
            return null;
        }

        function getContextValue(): RevenueCatContextValue {
            if (!contextValue) {
                throw new Error("RevenueCat context was not initialized");
            }

            return contextValue;
        }

        await act(async () => {
            create(
                <RevenueCatProvider client={client}>
                    <Consumer />
                </RevenueCatProvider>,
            );
        });

        expect(getContextValue().customerInfo?.originalAppUserId).toBe("acc_e");

        await act(async () => {
            await getContextValue().initialize({
                publicKeys: { ios: "appl_abc", android: "goog_abc" },
                accountId: "acc_b",
                platformOs: "ios",
            });
        });
        expect(client.configure).toHaveBeenCalledWith({
            publicKeys: { ios: "appl_abc", android: "goog_abc" },
            platformOs: "ios",
        });
        expect(client.logIn).toHaveBeenCalledWith("acc_b");
        expect(getContextValue().customerInfo?.originalAppUserId).toBe("acc_b");

        await act(async () => {
            await getContextValue().initialize({
                publicKeys: { ios: "appl_abc", android: "goog_abc" },
                platformOs: "android",
            });
        });
        expect(client.getCustomerInfo).toHaveBeenCalled();
        expect(getContextValue().customerInfo?.originalAppUserId).toBe("acc_a");

        await act(async () => {
            await getContextValue().logIn("acc_b");
        });
        expect(getContextValue().customerInfo?.originalAppUserId).toBe("acc_b");

        await act(async () => {
            await getContextValue().refreshCustomerInfo();
        });
        expect(getContextValue().customerInfo?.originalAppUserId).toBe("acc_a");

        await act(async () => {
            await getContextValue().getOfferings();
        });
        expect(client.getOfferings).toHaveBeenCalledTimes(1);

        await act(async () => {
            await getContextValue().restorePurchases();
        });
        expect(getContextValue().customerInfo?.originalAppUserId).toBe("acc_c");

        await act(async () => {
            await getContextValue().purchasePackage({} as PurchasesPackage);
        });
        expect(getContextValue().customerInfo?.originalAppUserId).toBe("acc_d");
    });
});

function makeClient(overrides?: Partial<RevenueCatClient>): RevenueCatClient {
    return {
        configure: jest.fn(),
        logIn: jest.fn(),
        getCustomerInfo: jest.fn(),
        getOfferings: jest.fn().mockResolvedValue({ current: null }),
        addCustomerInfoListener: jest.fn().mockReturnValue(jest.fn()),
        restorePurchases: jest.fn(),
        purchasePackage: jest.fn(),
        ...overrides,
    };
}

function makeCustomerInfo(accountId: string): CustomerInfo {
    return {
        entitlements: { all: {}, active: {}, verification: "NOT_REQUESTED" },
        activeSubscriptions: [],
        allPurchasedProductIdentifiers: [],
        latestExpirationDate: null,
        originalAppUserId: accountId,
        originalApplicationVersion: null,
        requestDate: "2026-02-06T00:00:00.000Z",
        firstSeen: "2026-02-06T00:00:00.000Z",
        managementURL: null,
        originalPurchaseDate: null,
        nonSubscriptionTransactions: [],
        subscriptionsByProductIdentifier: {},
    } as unknown as CustomerInfo;
}

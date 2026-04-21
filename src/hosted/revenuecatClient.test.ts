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
import type {
    CustomerInfo,
    CustomerInfoUpdateListener,
    PurchasesPackage,
} from "react-native-purchases";

import {
    createRevenueCatClient,
    resolveRevenueCatApiKey,
    toRevenueCatAppUserId,
} from "@/src/hosted/revenuecatClient";

describe("revenuecat client", () => {
    it("resolves platform api keys", () => {
        expect(
            resolveRevenueCatApiKey(
                { ios: "appl_abc", android: "goog_abc" },
                "ios",
            ),
        ).toBe("appl_abc");
        expect(
            resolveRevenueCatApiKey(
                { ios: "appl_abc", android: "goog_abc" },
                "android",
            ),
        ).toBe("goog_abc");
        expect(() =>
            resolveRevenueCatApiKey(
                { ios: "appl_abc", android: "goog_abc" },
                "web",
            ),
        ).toThrow("RevenueCat is not supported on platform: web");
        expect(() =>
            resolveRevenueCatApiKey({ android: "goog_abc" }, "ios"),
        ).toThrow("RevenueCat public key missing for ios platform");
    });

    it("maps account ids to app user ids", () => {
        expect(toRevenueCatAppUserId("acc_123")).toBe("acc_123");
        expect(() => toRevenueCatAppUserId("")).toThrow();
    });

    it("configures sdk and proxies customer operations", async () => {
        const customerInfo = makeCustomerInfo();
        const sdk = {
            configure: jest.fn(),
            logIn: jest.fn().mockResolvedValue({ customerInfo }),
            getCustomerInfo: jest.fn().mockResolvedValue(customerInfo),
            addCustomerInfoUpdateListener: jest.fn(),
            removeCustomerInfoUpdateListener: jest.fn().mockReturnValue(true),
            getOfferings: jest.fn().mockResolvedValue({ current: null }),
            restorePurchases: jest.fn().mockResolvedValue(customerInfo),
            purchasePackage: jest.fn().mockResolvedValue({
                customerInfo,
                productIdentifier: "test.product.primary",
            }),
        };

        const client = createRevenueCatClient({ sdk });

        client.configure({
            publicKeys: { ios: "appl_123" },
            appUserId: "acc_456",
            platformOs: "ios",
        });
        expect(sdk.configure).toHaveBeenCalledWith({
            apiKey: "appl_123",
            appUserID: "acc_456",
        });

        const logInResult = await client.logIn("acc_789");
        expect(logInResult).toBe(customerInfo);
        expect(sdk.logIn).toHaveBeenCalledWith("acc_789");

        await expect(client.getCustomerInfo()).resolves.toBe(customerInfo);
        await expect(client.getOfferings()).resolves.toEqual({ current: null });

        const listener = jest.fn() as CustomerInfoUpdateListener;
        const unsubscribe = client.addCustomerInfoListener(listener);
        expect(sdk.addCustomerInfoUpdateListener).toHaveBeenCalledWith(
            listener,
        );
        unsubscribe();
        expect(sdk.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(
            listener,
        );

        await expect(client.restorePurchases()).resolves.toEqual({
            customerInfo,
        });
        await expect(
            client.purchasePackage({} as PurchasesPackage),
        ).resolves.toEqual({
            customerInfo,
            productIdentifier: "test.product.primary",
        });
    });

    it("rejects invalid configure and login inputs", async () => {
        const sdk = {
            configure: jest.fn(),
            logIn: jest.fn(),
            getCustomerInfo: jest.fn(),
            addCustomerInfoUpdateListener: jest.fn(),
            removeCustomerInfoUpdateListener: jest.fn(),
            getOfferings: jest.fn(),
            restorePurchases: jest.fn(),
            purchasePackage: jest.fn(),
        };
        const client = createRevenueCatClient({ sdk });

        expect(() =>
            client.configure({
                publicKeys: { ios: "", android: "goog_123" },
                platformOs: "ios",
            }),
        ).toThrow();

        expect(() =>
            client.configure({
                publicKeys: { android: "goog_123" },
                platformOs: "ios",
            }),
        ).toThrow("RevenueCat public key missing for ios platform");

        await expect(client.logIn("")).rejects.toThrow();
    });
});

function makeCustomerInfo(): CustomerInfo {
    return {
        entitlements: { all: {}, active: {}, verification: "NOT_REQUESTED" },
        activeSubscriptions: [],
        allPurchasedProductIdentifiers: [],
        latestExpirationDate: null,
        originalAppUserId: "acc_123",
        originalApplicationVersion: null,
        requestDate: "2026-02-06T00:00:00.000Z",
        firstSeen: "2026-02-06T00:00:00.000Z",
        managementURL: null,
        originalPurchaseDate: null,
        nonSubscriptionTransactions: [],
        subscriptionsByProductIdentifier: {},
    } as unknown as CustomerInfo;
}

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
} from "react-native-purchases";

import {
    createRevenueCatClient,
    resolveRevenueCatApiKey,
    toRevenueCatAppUserId,
} from "@/src/hosted/revenuecatClient";
import type {
    HostedCustomerInfo,
    HostedCustomerInfoListener,
    HostedRevenueCatPackage,
} from "@/src/hosted/revenuecatTypes";

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
        expect(
            resolveRevenueCatApiKey(
                { ios: "appl_abc", android: "goog_abc", web: "web_abc" },
                "web",
            ),
        ).toBe("web_abc");
        expect(() =>
            resolveRevenueCatApiKey(
                { ios: "appl_abc", android: "goog_abc" },
                "web",
            ),
        ).toThrow("RevenueCat public key missing for web platform");
        expect(() =>
            resolveRevenueCatApiKey(
                { ios: "appl_abc", android: "goog_abc" },
                "windows",
            ),
        ).toThrow("RevenueCat is not supported on platform: windows");
        expect(() =>
            resolveRevenueCatApiKey({ android: "goog_abc" }, "ios"),
        ).toThrow("RevenueCat public key missing for ios platform");
    });

    it("maps account ids to app user ids", () => {
        expect(toRevenueCatAppUserId("acc_123")).toBe("acc_123");
        expect(() => toRevenueCatAppUserId("")).toThrow();
    });

    it("configures sdk and proxies customer operations", async () => {
        const nativeCustomerInfo = makeNativeCustomerInfo();
        const customerInfo = makeHostedCustomerInfo();
        const sdk = {
            configure: jest.fn(),
            logIn: jest.fn().mockResolvedValue({
                customerInfo: nativeCustomerInfo,
            }),
            getCustomerInfo: jest.fn().mockResolvedValue(nativeCustomerInfo),
            addCustomerInfoUpdateListener: jest.fn(),
            removeCustomerInfoUpdateListener: jest.fn().mockReturnValue(true),
            getOfferings: jest.fn().mockResolvedValue({ current: null }),
            restorePurchases: jest.fn().mockResolvedValue(nativeCustomerInfo),
            purchasePackage: jest.fn().mockResolvedValue({
                customerInfo: nativeCustomerInfo,
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
        expect(logInResult).toEqual(customerInfo);
        expect(sdk.logIn).toHaveBeenCalledWith("acc_789");

        await expect(client.getCustomerInfo()).resolves.toEqual(customerInfo);
        await expect(client.getOfferings()).resolves.toEqual({ current: null });

        const listener =
            jest.fn() as jest.MockedFunction<HostedCustomerInfoListener>;
        const unsubscribe = client.addCustomerInfoListener(listener);
        expect(sdk.addCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
        const nativeListener = sdk.addCustomerInfoUpdateListener.mock
            .calls[0]?.[0] as CustomerInfoUpdateListener;
        nativeListener(nativeCustomerInfo);
        expect(listener).toHaveBeenCalledWith(customerInfo);
        unsubscribe();
        expect(sdk.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(
            nativeListener,
        );

        await expect(client.restorePurchases()).resolves.toEqual({
            customerInfo,
        });
        await expect(
            client.purchasePackage(makeHostedPackage()),
        ).resolves.toEqual({
            customerInfo,
            productIdentifier: "test.product.primary",
        });
        expect(sdk.purchasePackage).toHaveBeenCalledWith("native-package");
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

function makeNativeCustomerInfo(): CustomerInfo {
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

function makeHostedCustomerInfo(): HostedCustomerInfo {
    return {
        entitlements: { all: {}, active: {} },
        subscriptionsByProductIdentifier: {},
        managementUrl: null,
        originalAppUserId: "acc_123",
    };
}

function makeHostedPackage(): HostedRevenueCatPackage {
    return {
        identifier: "primary",
        product: {
            identifier: "test.product.primary",
            title: "Primary",
            priceString: "$1.00",
        },
        target: "native-package",
    };
}

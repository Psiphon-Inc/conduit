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
import type { CustomerInfo } from "react-native-purchases";

import {
    mapRevenueCatEntitlementStatus,
    mapRevenueCatEntitlements,
} from "@/src/hosted/revenuecatEntitlements";

describe("revenuecat entitlement mapping", () => {
    const entitlementId = "hosted.conduit";
    const productId = "test.product.primary";
    const nowMs = Date.parse("2026-02-06T12:00:00.000Z");

    it("returns inactive when entitlement is missing", () => {
        const snapshot = mapRevenueCatEntitlementStatus({
            customerInfo: makeCustomerInfo(),
            entitlementId,
            nowMs,
        });

        expect(snapshot).toEqual({ entitlementId, status: "inactive" });
    });

    it("maps active entitlement", () => {
        const snapshot = mapRevenueCatEntitlementStatus({
            customerInfo: makeCustomerInfo({
                entitlementId,
                productId,
                isActive: true,
                willRenew: true,
                expirationDateMillis: nowMs + 60_000,
                expirationDate: "2026-02-06T12:01:00.000Z",
            }),
            entitlementId,
            nowMs,
        });

        expect(snapshot.status).toBe("active");
    });

    it("maps grace from billing issue and grace period date", () => {
        const fromBillingIssue = mapRevenueCatEntitlementStatus({
            customerInfo: makeCustomerInfo({
                entitlementId,
                productId,
                isActive: true,
                willRenew: true,
                expirationDateMillis: nowMs + 60_000,
                billingIssueDetectedAtMillis: nowMs - 1_000,
            }),
            entitlementId,
            nowMs,
        });

        const fromGraceDate = mapRevenueCatEntitlementStatus({
            customerInfo: makeCustomerInfo(
                {
                    entitlementId,
                    productId,
                    isActive: true,
                    willRenew: true,
                    expirationDateMillis: nowMs + 60_000,
                },
                {
                    productId,
                    gracePeriodExpiresDate: "2026-02-06T12:02:00.000Z",
                },
            ),
            entitlementId,
            nowMs,
        });

        expect(fromBillingIssue.status).toBe("grace");
        expect(fromGraceDate.status).toBe("grace");
    });

    it("maps canceled_not_expired", () => {
        const fromEntitlementExpiration = mapRevenueCatEntitlementStatus({
            customerInfo: makeCustomerInfo({
                entitlementId,
                productId,
                isActive: true,
                willRenew: false,
                expirationDateMillis: nowMs + 60_000,
            }),
            entitlementId,
            nowMs,
        });

        const fromSubscriptionExpiration = mapRevenueCatEntitlementStatus({
            customerInfo: makeCustomerInfo(
                {
                    entitlementId,
                    productId,
                    isActive: false,
                    willRenew: false,
                },
                { productId, expiresDate: "2026-02-06T12:05:00.000Z" },
            ),
            entitlementId,
            nowMs,
        });

        expect(fromEntitlementExpiration.status).toBe("canceled_not_expired");
        expect(fromSubscriptionExpiration.status).toBe("canceled_not_expired");
    });

    it("maps expired and inactive from expiration date", () => {
        const expired = mapRevenueCatEntitlementStatus({
            customerInfo: makeCustomerInfo({
                entitlementId,
                productId,
                isActive: false,
                willRenew: false,
                expirationDateMillis: nowMs - 1,
            }),
            entitlementId,
            nowMs,
        });

        const inactive = mapRevenueCatEntitlementStatus({
            customerInfo: makeCustomerInfo({
                entitlementId,
                productId,
                isActive: false,
                willRenew: true,
                expirationDateMillis: nowMs + 60_000,
            }),
            entitlementId,
            nowMs,
        });

        expect(expired.status).toBe("expired");
        expect(inactive.status).toBe("inactive");
    });

    it("maps all requested entitlements in order", () => {
        const customerInfo = makeCustomerInfo({
            entitlementId,
            productId,
            isActive: true,
            willRenew: false,
        });

        const snapshots = mapRevenueCatEntitlements({
            customerInfo,
            entitlementIds: [entitlementId, "missing.entitlement"],
            nowMs,
        });

        expect(snapshots[0].status).toBe("canceled_not_expired");
        expect(snapshots[1]).toEqual({
            entitlementId: "missing.entitlement",
            status: "inactive",
        });
    });
});

interface EntitlementInput {
    entitlementId: string;
    productId: string;
    isActive: boolean;
    willRenew: boolean;
    expirationDateMillis?: number;
    expirationDate?: string;
    billingIssueDetectedAtMillis?: number;
}

interface SubscriptionInput {
    productId: string;
    expiresDate?: string;
    gracePeriodExpiresDate?: string;
}

function makeCustomerInfo(
    entitlement?: EntitlementInput,
    subscription?: SubscriptionInput,
): CustomerInfo {
    const entitlementRecord = entitlement
        ? {
              [entitlement.entitlementId]: {
                  identifier: entitlement.entitlementId,
                  productIdentifier: entitlement.productId,
                  isActive: entitlement.isActive,
                  willRenew: entitlement.willRenew,
                  billingIssueDetectedAtMillis:
                      entitlement.billingIssueDetectedAtMillis ?? null,
                  expirationDateMillis:
                      entitlement.expirationDateMillis ?? null,
                  expirationDate: entitlement.expirationDate ?? null,
              },
          }
        : {};

    const subscriptionRecord = subscription
        ? {
              [subscription.productId]: {
                  productIdentifier: subscription.productId,
                  expiresDate: subscription.expiresDate ?? null,
                  gracePeriodExpiresDate:
                      subscription.gracePeriodExpiresDate ?? null,
              },
          }
        : {};

    return {
        entitlements: {
            all: entitlementRecord,
            active: entitlement?.isActive ? entitlementRecord : {},
            verification: "NOT_REQUESTED",
        },
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
        subscriptionsByProductIdentifier: subscriptionRecord,
    } as unknown as CustomerInfo;
}

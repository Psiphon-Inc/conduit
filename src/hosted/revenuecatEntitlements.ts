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
    PurchasesEntitlementInfo,
    PurchasesSubscriptionInfo,
} from "react-native-purchases";
import { z } from "zod";

export const HostedEntitlementStatusSchema = z.enum([
    "active",
    "grace",
    "canceled_not_expired",
    "inactive",
    "expired",
]);
export type HostedEntitlementStatus = z.infer<
    typeof HostedEntitlementStatusSchema
>;

export interface HostedEntitlementSnapshot {
    entitlementId: string;
    status: HostedEntitlementStatus;
    productId?: string;
    expiresAt?: string;
}

export interface MapRevenueCatEntitlementInput {
    customerInfo: CustomerInfo;
    entitlementId: string;
    nowMs?: number;
}

export interface MapRevenueCatEntitlementsInput {
    customerInfo: CustomerInfo;
    entitlementIds: string[];
    nowMs?: number;
}

/**
 * RevenueCat does not expose an explicit contract enum for "grace" and
 * "canceled_not_expired", so this adapter derives those states from
 * entitlement + subscription fields.
 */
export function mapRevenueCatEntitlementStatus(
    input: MapRevenueCatEntitlementInput,
): HostedEntitlementSnapshot {
    const nowMs = input.nowMs ?? Date.now();
    const entitlement =
        input.customerInfo.entitlements.all[input.entitlementId];

    if (!entitlement) {
        return {
            entitlementId: input.entitlementId,
            status: "inactive",
        };
    }

    const subscription = getSubscriptionInfo(
        input.customerInfo,
        entitlement.productIdentifier,
    );

    if (isInGrace(entitlement, subscription, nowMs)) {
        return toSnapshot(input.entitlementId, entitlement, "grace");
    }

    if (isCanceledNotExpired(entitlement, subscription, nowMs)) {
        return toSnapshot(
            input.entitlementId,
            entitlement,
            "canceled_not_expired",
        );
    }

    if (entitlement.isActive) {
        return toSnapshot(input.entitlementId, entitlement, "active");
    }

    if (entitlement.expirationDateMillis != null) {
        return toSnapshot(
            input.entitlementId,
            entitlement,
            entitlement.expirationDateMillis <= nowMs ? "expired" : "inactive",
        );
    }

    return toSnapshot(input.entitlementId, entitlement, "inactive");
}

export function mapRevenueCatEntitlements(
    input: MapRevenueCatEntitlementsInput,
): HostedEntitlementSnapshot[] {
    return input.entitlementIds.map((entitlementId) =>
        mapRevenueCatEntitlementStatus({
            customerInfo: input.customerInfo,
            entitlementId,
            nowMs: input.nowMs,
        }),
    );
}

function getSubscriptionInfo(
    customerInfo: CustomerInfo,
    productId: string,
): PurchasesSubscriptionInfo | undefined {
    return customerInfo.subscriptionsByProductIdentifier[productId];
}

function isInGrace(
    entitlement: PurchasesEntitlementInfo,
    subscription: PurchasesSubscriptionInfo | undefined,
    nowMs: number,
): boolean {
    if (!entitlement.isActive) {
        return false;
    }

    if (entitlement.billingIssueDetectedAtMillis != null) {
        return true;
    }

    const gracePeriodExpiresDate = subscription?.gracePeriodExpiresDate;
    if (!gracePeriodExpiresDate) {
        return false;
    }

    const gracePeriodExpiresAtMs = Date.parse(gracePeriodExpiresDate);
    return (
        Number.isFinite(gracePeriodExpiresAtMs) &&
        gracePeriodExpiresAtMs > nowMs
    );
}

function isCanceledNotExpired(
    entitlement: PurchasesEntitlementInfo,
    subscription: PurchasesSubscriptionInfo | undefined,
    nowMs: number,
): boolean {
    if (entitlement.willRenew) {
        return false;
    }

    if (entitlement.expirationDateMillis != null) {
        return entitlement.expirationDateMillis > nowMs;
    }

    const subscriptionExpiresAtMs = Date.parse(subscription?.expiresDate ?? "");
    if (Number.isFinite(subscriptionExpiresAtMs)) {
        return subscriptionExpiresAtMs > nowMs;
    }

    return entitlement.isActive;
}

function toSnapshot(
    entitlementId: string,
    entitlement: PurchasesEntitlementInfo,
    status: HostedEntitlementStatus,
): HostedEntitlementSnapshot {
    return {
        entitlementId,
        status,
        productId: entitlement.productIdentifier,
        expiresAt: entitlement.expirationDate ?? undefined,
    };
}

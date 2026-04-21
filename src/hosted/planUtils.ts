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
    PurchasesOfferings,
    PurchasesPackage,
} from "react-native-purchases";

export interface HostedPlanOption {
    key: string;
    package: PurchasesPackage;
    title: string;
    features: string[];
    priceText: string;
    badge: string | null;
    matchedPlanId: string | null;
    isGenericFallback: boolean;
}

export interface HostedPlanSelectionDescriptor {
    matchedPlanId: string | null;
    title: string;
}

/**
 * Selects the "recommended" plan or falls back to the first plan.
 */
export function pickDefaultHostedPlanOption(
    options: HostedPlanOption[],
): HostedPlanOption | null {
    const recommended = options.find((option) => {
        if (!option.badge) {
            return false;
        }
        return option.badge.toLowerCase().includes("recommended");
    });
    return recommended ?? options[0] ?? null;
}

/**
 * Resolves which plan option should be selected from available options
 * using key, plan ID, or title matching.
 */
export function resolveHostedSelectedPlanOption({
    options,
    selectedPlanKey,
    selectedPlanDescriptor,
}: {
    options: HostedPlanOption[];
    selectedPlanKey: string | null;
    selectedPlanDescriptor: HostedPlanSelectionDescriptor | null;
}): HostedPlanOption | null {
    if (selectedPlanKey) {
        const explicit =
            options.find((option) => option.key === selectedPlanKey) ?? null;
        if (explicit) {
            return explicit;
        }
    }

    if (selectedPlanDescriptor?.matchedPlanId) {
        const byPlanId =
            options.find(
                (option) =>
                    option.matchedPlanId ===
                    selectedPlanDescriptor.matchedPlanId,
            ) ?? null;
        if (byPlanId) {
            return byPlanId;
        }
    }

    if (selectedPlanDescriptor?.title) {
        const normalizedSelectedTitle = normalizeStatusText(
            selectedPlanDescriptor.title,
        );
        const byTitle =
            options.find(
                (option) =>
                    normalizeStatusText(option.title) ===
                    normalizedSelectedTitle,
            ) ?? null;
        if (byTitle) {
            return byTitle;
        }
    }

    return pickDefaultHostedPlanOption(options);
}

/**
 * Formats a plan's price text, normalizing currency prefix and appending
 * billing window.
 */
export function formatHostedPlanPrice(option: HostedPlanOption): string {
    const normalizedPrice = option.priceText.replace(/^[A-Z]{2,3}\$/, "$");
    const billingWindow = inferHostedPlanBillingWindow(option);
    if (!billingWindow) {
        return normalizedPrice;
    }
    return `${normalizedPrice}/${billingWindow}`;
}

/**
 * Infers the billing period (month/year/etc.) from a plan's title and key.
 */
export function inferHostedPlanBillingWindow(
    option: HostedPlanOption,
): string | null {
    const signature = `${option.title} ${option.key}`.toLowerCase();
    if (signature.includes("annual") || signature.includes("year")) {
        return "year";
    }
    if (
        signature.includes("six_month") ||
        signature.includes("6 month") ||
        signature.includes("half year")
    ) {
        return "6 months";
    }
    if (
        signature.includes("three_month") ||
        signature.includes("3 month") ||
        signature.includes("quarter")
    ) {
        return "3 months";
    }
    if (signature.includes("two_month") || signature.includes("2 month")) {
        return "2 months";
    }
    if (signature.includes("month")) {
        return "month";
    }
    if (signature.includes("week")) {
        return "week";
    }
    return null;
}

/**
 * Checks if an error message indicates a cancelled purchase.
 */
export function isCancelledPurchaseError(message: string): boolean {
    const normalized = normalizeStatusText(message);
    return normalized.includes("purchase was cancelled");
}

/**
 * Normalizes a status string to lowercase trimmed form for comparison.
 */
export function normalizeStatusText(value: string | null | undefined): string {
    if (!value) {
        return "";
    }
    return value.trim().toLowerCase();
}

/**
 * Extracts candidate package metadata from RevenueCat offerings.
 */
export function toRevenueCatPackageCandidates(
    offerings: PurchasesOfferings,
): Array<{
    packageId: string;
    productId: string;
    productTitle?: string;
    priceString: string;
    packageRef: PurchasesPackage;
    entitlementId?: string;
}> {
    const availablePackages = offerings.current?.availablePackages ?? [];
    return availablePackages.map((aPackage) => ({
        packageId: aPackage.identifier,
        productId: aPackage.product.identifier,
        productTitle: aPackage.product.title,
        priceString: aPackage.product.priceString,
        packageRef: aPackage,
        entitlementId: undefined,
    }));
}

/**
 * Resolves the first available RevenueCat package or throws.
 */
export async function resolveFirstHostedPackage(
    options: HostedPlanOption[],
): Promise<PurchasesPackage> {
    const first = options[0]?.package;
    if (first) {
        return first;
    }
    throw new Error(
        "No catalog-mapped packages are available in the current RevenueCat offering.",
    );
}

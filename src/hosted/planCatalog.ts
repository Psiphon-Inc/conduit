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
import {
    HostedCatalogPlatform,
    HostedPlanCatalogPlan,
    HostedPlanCatalogResponse,
} from "@/src/hosted/contracts";

export interface RevenueCatPackageCandidate<TPackage = unknown> {
    packageId: string;
    productId: string;
    productTitle?: string;
    entitlementId?: string;
    priceString: string;
    packageRef: TPackage;
}

export interface HostedPlanOption<TPackage = unknown> {
    key: string;
    package: TPackage;
    title: string;
    features: string[];
    priceText: string;
    badge: string | null;
    sortOrder: number;
    matchedPlanId: string | null;
    isGenericFallback: boolean;
}

export interface ResolveHostedPlanOptionsInput<TPackage = unknown> {
    revenueCatPackages: RevenueCatPackageCandidate<TPackage>[];
    catalog: HostedPlanCatalogResponse;
    platform: HostedCatalogPlatform;
    appVersion: string;
    country?: string;
}

export interface ResolveHostedPlanOptionsResult<TPackage = unknown> {
    options: HostedPlanOption<TPackage>[];
    blockingError: string | null;
    unmatchedPackageIds: string[];
}

export function resolveHostedPlanOptions<TPackage>(
    input: ResolveHostedPlanOptionsInput<TPackage>,
): ResolveHostedPlanOptionsResult<TPackage> {
    const visiblePlans = input.catalog.plans.filter((plan) =>
        shouldDisplayPlan(
            plan,
            input.platform,
            input.appVersion,
            input.country,
        ),
    );
    const sortedPlans = [...visiblePlans].sort(sortPlans);
    const unmatched: string[] = [];

    const mapped = input.revenueCatPackages.reduce<
        HostedPlanOption<TPackage>[]
    >((accumulator, candidate) => {
        const matchedPlan = pickBestPlanMatch(candidate, sortedPlans);
        if (matchedPlan) {
            accumulator.push({
                key: candidate.packageId,
                package: candidate.packageRef,
                title: matchedPlan.display.title,
                features: matchedPlan.display.featureBullets,
                priceText: candidate.priceString,
                badge: matchedPlan.display.badge,
                sortOrder: matchedPlan.sortOrder,
                matchedPlanId: matchedPlan.id,
                isGenericFallback: false,
            });
            return accumulator;
        }

        unmatched.push(candidate.packageId);
        if (input.catalog.fallbackPolicy.unmappedRevenueCatPackage === "hide") {
            return accumulator;
        }

        if (
            input.catalog.fallbackPolicy.unmappedRevenueCatPackage === "error"
        ) {
            return accumulator;
        }
        return accumulator;
    }, []);

    let blockingError: string | null = null;
    if (mapped.length === 0 && input.revenueCatPackages.length > 0) {
        blockingError =
            "Fatal configuration mismatch: RevenueCat offering has no plans mapped by Hosted Conduit catalog. Ask support to fix backend catalog mapping and retry.";
    } else if (
        input.catalog.fallbackPolicy.unmappedRevenueCatPackage === "error" &&
        unmatched.length > 0
    ) {
        blockingError =
            "Fatal configuration mismatch: Hosted plan catalog does not map all RevenueCat packages in the current offering. Ask support to fix backend catalog mapping and retry.";
    }

    return {
        options: mapped.sort(sortResolvedOptions),
        blockingError,
        unmatchedPackageIds: unmatched,
    };
}

function pickBestPlanMatch(
    candidate: RevenueCatPackageCandidate,
    plans: HostedPlanCatalogPlan[],
): HostedPlanCatalogPlan | null {
    const byPackageId = plans.filter((plan) =>
        plan.mapping.revenueCat.packageIds?.includes(candidate.packageId),
    );
    if (byPackageId.length > 0) {
        return byPackageId[0] ?? null;
    }

    const byProductId = plans.filter((plan) =>
        plan.mapping.revenueCat.productIds?.includes(candidate.productId),
    );
    if (byProductId.length > 0) {
        return byProductId[0] ?? null;
    }

    if (!candidate.entitlementId) {
        return null;
    }
    const entitlementId = candidate.entitlementId;

    const byEntitlementId = plans.filter((plan) =>
        plan.mapping.revenueCat.entitlementIds?.includes(entitlementId),
    );
    if (byEntitlementId.length > 0) {
        return byEntitlementId[0] ?? null;
    }

    const candidateAliases = [
        candidate.packageId,
        candidate.productId,
        candidate.productTitle,
    ]
        .filter((value): value is string => typeof value === "string")
        .map(normalizeIdentifier);

    if (candidateAliases.length === 0) {
        return null;
    }

    const fuzzyMatch = plans.find((plan) => {
        const planAliases = [
            plan.id,
            plan.display.title,
            ...(plan.mapping.revenueCat.packageIds ?? []),
            ...(plan.mapping.revenueCat.productIds ?? []),
        ].map(normalizeIdentifier);

        return candidateAliases.some((candidateAlias) =>
            planAliases.some(
                (planAlias) =>
                    candidateAlias === planAlias ||
                    candidateAlias.endsWith(planAlias) ||
                    planAlias.endsWith(candidateAlias),
            ),
        );
    });

    return fuzzyMatch ?? null;
}

function shouldDisplayPlan(
    plan: HostedPlanCatalogPlan,
    platform: HostedCatalogPlatform,
    appVersion: string,
    country?: string,
): boolean {
    if (plan.status === "hidden") {
        return false;
    }

    if (plan.constraints?.allowedPlatforms?.includes(platform) === false) {
        return false;
    }

    if (plan.constraints?.minAppVersion) {
        if (compareSemver(appVersion, plan.constraints.minAppVersion) < 0) {
            return false;
        }
    }

    const normalizedCountry = normalizeCountry(country);
    if (!normalizedCountry) {
        return true;
    }

    if (plan.constraints?.countryBlocklist?.includes(normalizedCountry)) {
        return false;
    }

    if (
        plan.constraints?.countryAllowlist &&
        !plan.constraints.countryAllowlist.includes(normalizedCountry)
    ) {
        return false;
    }

    return true;
}

function sortResolvedOptions<TPackage>(
    left: HostedPlanOption<TPackage>,
    right: HostedPlanOption<TPackage>,
): number {
    if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
    }
    return left.key.localeCompare(right.key);
}

function sortPlans(
    left: HostedPlanCatalogPlan,
    right: HostedPlanCatalogPlan,
): number {
    if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
    }
    return left.id.localeCompare(right.id);
}

function compareSemver(left: string, right: string): number {
    const leftParts = toSemverParts(left);
    const rightParts = toSemverParts(right);
    const width = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < width; index += 1) {
        const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
        if (delta !== 0) {
            return delta;
        }
    }

    return 0;
}

function toSemverParts(value: string): number[] {
    return value
        .trim()
        .split(".")
        .map((part) => Number.parseInt(part.replace(/[^0-9].*$/, ""), 10))
        .map((part) => (Number.isFinite(part) && part >= 0 ? part : 0));
}

function normalizeCountry(country?: string): string | null {
    if (!country) {
        return null;
    }
    const normalized = country.trim().toUpperCase();
    return normalized.length === 2 ? normalized : null;
}

function normalizeIdentifier(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

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
import { HostedPlanCatalogResponse } from "@/src/hosted/contracts";
import { resolveHostedPlanOptions } from "@/src/hosted/planCatalog";

describe("hosted plan catalog matching", () => {
    it("renders seed catalog metadata while keeping RC price strings", () => {
        const catalog = buildSeedCatalog();
        const result = resolveHostedPlanOptions({
            catalog,
            platform: "ios",
            appVersion: "1.8.0",
            country: "US",
            revenueCatPackages: [
                {
                    packageId: "plan_beta_monthly",
                    productId: "test.product.beta.monthly",
                    priceString: "$10",
                    packageRef: { id: "beta-monthly" },
                },
                {
                    packageId: "plan_gamma_annual",
                    productId: "test.product.gamma.annual",
                    priceString: "$30",
                    packageRef: { id: "gamma-annual" },
                },
                {
                    packageId: "plan_alpha_annual",
                    productId: "test.product.alpha.annual",
                    priceString: "$20",
                    packageRef: { id: "alpha-annual" },
                },
            ],
        });

        expect(result.blockingError).toBeNull();
        expect(result.options.map((option) => option.key)).toEqual([
            "plan_alpha_annual",
            "plan_beta_monthly",
            "plan_gamma_annual",
        ]);
        expect(result.options[0].title).toBe("Annual Plan Alpha");
        expect(result.options[0].badge).toBe("Recommended");
        expect(result.options[0].features).toEqual([
            "Feature set A",
            "Feature set B",
        ]);
        expect(result.options[1].priceText).toBe("$10");
    });

    it("matches by packageId then productId then entitlementId", () => {
        const catalog: HostedPlanCatalogResponse = {
            ...buildSeedCatalog(),
            plans: [
                {
                    ...buildSeedCatalog().plans[0],
                    id: "pkg-match",
                    sortOrder: 5,
                    mapping: {
                        revenueCat: {
                            packageIds: ["pkg-hit"],
                        },
                    },
                },
                {
                    ...buildSeedCatalog().plans[1],
                    id: "product-match",
                    sortOrder: 10,
                    mapping: {
                        revenueCat: {
                            productIds: ["product-hit"],
                        },
                    },
                },
                {
                    ...buildSeedCatalog().plans[2],
                    id: "entitlement-match",
                    sortOrder: 15,
                    mapping: {
                        revenueCat: {
                            entitlementIds: ["entitlement-hit"],
                        },
                    },
                },
            ],
        };

        const result = resolveHostedPlanOptions({
            catalog,
            platform: "ios",
            appVersion: "1.8.0",
            revenueCatPackages: [
                {
                    packageId: "pkg-hit",
                    productId: "product-hit",
                    entitlementId: "entitlement-hit",
                    priceString: "$1",
                    packageRef: null,
                },
                {
                    packageId: "pkg-miss",
                    productId: "product-hit",
                    entitlementId: "entitlement-hit",
                    priceString: "$2",
                    packageRef: null,
                },
                {
                    packageId: "pkg-miss-2",
                    productId: "product-miss",
                    entitlementId: "entitlement-hit",
                    priceString: "$3",
                    packageRef: null,
                },
            ],
        });

        expect(result.options.map((option) => option.matchedPlanId)).toEqual([
            "pkg-match",
            "product-match",
            "entitlement-match",
        ]);
    });

    it("tie-breaks duplicate matches by sortOrder then plan id", () => {
        const catalog: HostedPlanCatalogResponse = {
            ...buildSeedCatalog(),
            plans: [
                {
                    ...buildSeedCatalog().plans[0],
                    id: "b-plan",
                    sortOrder: 10,
                    mapping: { revenueCat: { packageIds: ["same"] } },
                },
                {
                    ...buildSeedCatalog().plans[1],
                    id: "a-plan",
                    sortOrder: 10,
                    mapping: { revenueCat: { packageIds: ["same"] } },
                },
            ],
        };

        const result = resolveHostedPlanOptions({
            catalog,
            platform: "ios",
            appVersion: "1.8.0",
            revenueCatPackages: [
                {
                    packageId: "same",
                    productId: "same",
                    priceString: "$9",
                    packageRef: null,
                },
            ],
        });

        expect(result.options[0].matchedPlanId).toBe("a-plan");
    });

    it("hard-blocks when catalog and offering do not intersect", () => {
        const base = buildSeedCatalog();
        const candidate = {
            packageId: "unmapped",
            productId: "unmapped",
            priceString: "$4",
            packageRef: null,
        };

        const showGeneric = resolveHostedPlanOptions({
            catalog: base,
            platform: "ios",
            appVersion: "1.8.0",
            revenueCatPackages: [candidate],
        });
        expect(showGeneric.options).toHaveLength(0);
        expect(showGeneric.blockingError).toContain(
            "Fatal configuration mismatch",
        );

        const hide = resolveHostedPlanOptions({
            catalog: {
                ...base,
                fallbackPolicy: { unmappedRevenueCatPackage: "hide" },
            },
            platform: "ios",
            appVersion: "1.8.0",
            revenueCatPackages: [candidate],
        });
        expect(hide.options).toHaveLength(0);
        expect(hide.blockingError).toContain("Fatal configuration mismatch");

        const error = resolveHostedPlanOptions({
            catalog: {
                ...base,
                fallbackPolicy: { unmappedRevenueCatPackage: "error" },
            },
            platform: "ios",
            appVersion: "1.8.0",
            revenueCatPackages: [candidate],
        });
        expect(error.options).toHaveLength(0);
        expect(error.blockingError).toContain("Fatal configuration mismatch");
    });
});

function buildSeedCatalog(): HostedPlanCatalogResponse {
    return {
        catalogVersion: "2026-02-09.1",
        generatedAt: "2026-02-09T18:00:00Z",
        currencyDisplayMode: "revenuecat_price_string",
        fallbackPolicy: {
            unmappedRevenueCatPackage: "show_generic",
        },
        plans: [
            {
                id: "plan_alpha_annual",
                status: "active",
                sortOrder: 10,
                mapping: {
                    revenueCat: {
                        packageIds: ["plan_alpha_annual"],
                    },
                },
                display: {
                    title: "Annual Plan Alpha",
                    subtitle: null,
                    badge: "Recommended",
                    featureBullets: ["Feature set A", "Feature set B"],
                    marketingCopy: null,
                },
                billing: {
                    cadence: "yearly",
                },
            },
            {
                id: "plan_beta_monthly",
                status: "active",
                sortOrder: 20,
                mapping: {
                    revenueCat: {
                        packageIds: ["plan_beta_monthly"],
                    },
                },
                display: {
                    title: "Monthly Plan Beta",
                    subtitle: null,
                    badge: null,
                    featureBullets: ["Feature set C"],
                    marketingCopy: null,
                },
                billing: {
                    cadence: "monthly",
                },
            },
            {
                id: "plan_gamma_annual",
                status: "active",
                sortOrder: 30,
                mapping: {
                    revenueCat: {
                        packageIds: ["plan_gamma_annual"],
                    },
                },
                display: {
                    title: "Annual Plan Gamma",
                    subtitle: null,
                    badge: null,
                    featureBullets: ["Feature set D", "Feature set E"],
                    marketingCopy: null,
                },
                billing: {
                    cadence: "yearly",
                },
            },
        ],
    };
}

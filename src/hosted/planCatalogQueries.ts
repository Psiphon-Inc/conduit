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
import { UseQueryResult, useQuery } from "@tanstack/react-query";
import React from "react";

import {
    HostedApiClientRequestError,
    createHostedApiClient,
} from "@/src/hosted/apiClient";
import { buildHostedPlanCatalogQuery } from "@/src/hosted/deviceInfo";
import { resolveHostedPlanOptions } from "@/src/hosted/planCatalog";
import {
    HostedPlanOption,
    toRevenueCatPackageCandidates,
} from "@/src/hosted/planUtils";
import { HostedRevenueCatOfferings } from "@/src/hosted/revenuecatTypes";
import {
    recordClientEvent,
    recordClientEventProblem,
} from "@/src/telemetry/clientEvents";

interface HostedPlanOptionsQueryInput {
    baseUrl: string;
    accountId: string | null | undefined;
    enabled: boolean;
    getOfferings: () => Promise<HostedRevenueCatOfferings>;
    refreshSessionIfNeeded: () => Promise<{ accessToken: string }>;
    refreshSession: () => Promise<{ accessToken: string }>;
}

interface HostedPlanOptionsQueryData {
    options: HostedPlanOption[];
    blockingError: string | null;
    offeringIdentifier: string | null;
}

export function useHostedPlanOptionsQuery(
    input: HostedPlanOptionsQueryInput,
): UseQueryResult<HostedPlanOptionsQueryData> {
    const hostedClient = React.useMemo(
        () => createHostedApiClient({ baseUrl: input.baseUrl }),
        [input.baseUrl],
    );
    const planCatalogQuery = React.useMemo(buildHostedPlanCatalogQuery, []);

    return useQuery({
        queryKey: [
            "hosted",
            "activate-offerings",
            input.accountId,
            planCatalogQuery,
        ],
        enabled: input.enabled,
        queryFn: async () => {
            const [offerings, session] = await Promise.all([
                input.getOfferings(),
                input.refreshSessionIfNeeded(),
            ]);
            const fetchPlanCatalog = (accessToken: string) =>
                hostedClient.getPlanCatalog(accessToken, planCatalogQuery);
            let planCatalog: Awaited<ReturnType<typeof fetchPlanCatalog>>;
            try {
                planCatalog = await fetchPlanCatalog(session.accessToken);
            } catch (error) {
                if (
                    !(error instanceof HostedApiClientRequestError) ||
                    error.status !== 401
                ) {
                    throw error;
                }

                const refreshed = await input.refreshSession();
                planCatalog = await fetchPlanCatalog(refreshed.accessToken);
            }
            const revenueCatPackages = toRevenueCatPackageCandidates(offerings);
            const fallback = resolveHostedPlanOptions({
                catalog: planCatalog,
                platform: planCatalogQuery.platform,
                appVersion: planCatalogQuery.appVersion,
                country: planCatalogQuery.country,
                revenueCatPackages,
            });
            const matchDiagnostics = {
                offeringIdentifier: offerings.current?.identifier ?? null,
                platform: planCatalogQuery.platform,
                appVersion: planCatalogQuery.appVersion,
                country: planCatalogQuery.country ?? null,
                catalogVersion: planCatalog.catalogVersion,
                catalogPlanCount: planCatalog.plans.length,
                catalogPlans: planCatalog.plans.map((plan) => ({
                    id: plan.id,
                    status: plan.status,
                    allowedPlatforms:
                        plan.constraints?.allowedPlatforms ?? null,
                    packageIds: plan.mapping.revenueCat.packageIds ?? [],
                    productIds: plan.mapping.revenueCat.productIds ?? [],
                    entitlementIds:
                        plan.mapping.revenueCat.entitlementIds ?? [],
                })),
                revenueCatPackageCount: revenueCatPackages.length,
                revenueCatPackages: revenueCatPackages.map((candidate) => ({
                    packageId: candidate.packageId,
                    productId: candidate.productId,
                    productTitle: candidate.productTitle ?? null,
                })),
                unmatchedPackageIds: fallback.unmatchedPackageIds,
            };
            if (fallback.blockingError || fallback.options.length === 0) {
                const message =
                    fallback.blockingError ??
                    "Hosted plan catalog produced no visible plan options.";
                recordClientEventProblem(
                    "hosted.plan_catalog.match_error",
                    message,
                    matchDiagnostics,
                );
                recordClientEvent("hosted.plan_catalog.match_result", {
                    ...matchDiagnostics,
                    blockingError: fallback.blockingError,
                });
            }
            return {
                options: fallback.options,
                blockingError: fallback.blockingError,
                offeringIdentifier: offerings.current?.identifier ?? null,
            };
        },
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        retry: 3,
        retryDelay: 5_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchInterval: (query) => (query.state.error ? 10_000 : false),
        placeholderData: (previous) => previous,
    });
}

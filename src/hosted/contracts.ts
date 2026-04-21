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
import { base64nopad } from "@scure/base";
import { z } from "zod";

export const OAuthProviderSchema = z.enum(["google", "apple"]);
export type OAuthProvider = z.infer<typeof OAuthProviderSchema>;

export const OAuthPlatformSchema = z.enum(["android", "ios"]);
export type OAuthPlatform = z.infer<typeof OAuthPlatformSchema>;

export const HostedBrokerTokenTypeSchema = z.enum(["clerk_broker_jwt"]);
export type HostedBrokerTokenType = z.infer<typeof HostedBrokerTokenTypeSchema>;

export const HostedLoginRequestSchema = z.object({
    token_type: HostedBrokerTokenTypeSchema,
    broker_token: z.string().min(1),
    platform: OAuthPlatformSchema,
    client_version: z.string().min(1),
});
export type HostedLoginRequest = z.infer<typeof HostedLoginRequestSchema>;

export const PersonalCompartmentIdSchema = z
    .string()
    .regex(/^[A-Za-z0-9+/]{43}$/)
    .refine((value) => {
        try {
            return base64nopad.decode(value).length === 32;
        } catch {
            return false;
        }
    });
export type PersonalCompartmentId = z.infer<typeof PersonalCompartmentIdSchema>;

export const SessionTokenResponseSchema = z.object({
    account_id: z.string().min(1),
    access_token: z.string().min(1),
    access_token_expires_in_seconds: z.number().int().positive(),
    refresh_token: z.string().min(1),
    refresh_token_expires_in_seconds: z.number().int().positive(),
    personal_pairing_wrapper_base_url: z.string().min(1).optional(),
    account: z
        .object({
            account_id: z.string().min(1).optional(),
            alias: z.string(),
            alias_is_default: z.boolean(),
            alias_updated_at: z.string().min(1).optional(),
            profile_version: z.number().int().nonnegative(),
        })
        .optional(),
});
export type SessionTokenResponse = z.infer<typeof SessionTokenResponseSchema>;

export const RefreshRequestSchema = z.object({
    refresh_token: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const RefreshResponseSchema = z.object({
    access_token: z.string().min(1),
    access_token_expires_in_seconds: z.number().int().positive(),
    refresh_token: z.string().min(1).optional(),
    refresh_token_expires_in_seconds: z.number().int().positive().optional(),
    personal_pairing_wrapper_base_url: z.string().min(1).optional(),
    account: z
        .object({
            account_id: z.string().min(1).optional(),
            alias: z.string(),
            alias_is_default: z.boolean(),
            alias_updated_at: z.string().min(1).optional(),
            profile_version: z.number().int().nonnegative(),
        })
        .optional(),
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const AccountProfileSchema = z.object({
    account_id: z.string().min(1).optional(),
    alias: z.string(),
    alias_is_default: z.boolean(),
    alias_updated_at: z.string().min(1).optional(),
    profile_version: z.number().int().nonnegative(),
});
export type AccountProfile = z.infer<typeof AccountProfileSchema>;

export const UpdateAccountProfileRequestSchema = z.object({
    alias: z.string(),
    expected_profile_version: z.number().int().nonnegative(),
});
export type UpdateAccountProfileRequest = z.infer<
    typeof UpdateAccountProfileRequestSchema
>;

export const HostedApiErrorSchema = z.object({
    error: z.object({
        code: z.string().min(1),
        message: z.string().min(1),
    }),
});
export type HostedApiError = z.infer<typeof HostedApiErrorSchema>;

export const SetPersonalCompartmentIdRequestSchema = z.object({
    personal_compartment_id: PersonalCompartmentIdSchema,
});
export type SetPersonalCompartmentIdRequest = z.infer<
    typeof SetPersonalCompartmentIdRequestSchema
>;

export const SetPersonalCompartmentIdResponseSchema = z.object({
    personal_compartment_id: PersonalCompartmentIdSchema,
});
export type SetPersonalCompartmentIdResponse = z.infer<
    typeof SetPersonalCompartmentIdResponseSchema
>;

export const SetPersonalCompartmentIdConflictResponseSchema = z.object({
    error: HostedApiErrorSchema.shape.error,
    current_personal_compartment_id: PersonalCompartmentIdSchema,
});
export type SetPersonalCompartmentIdConflictResponse = z.infer<
    typeof SetPersonalCompartmentIdConflictResponseSchema
>;

export const ConduitStatusSchema = z.enum([
    "none",
    "provisioning",
    "active",
    "suspended",
]);
export type ConduitStatus = z.infer<typeof ConduitStatusSchema>;

export const HostedRyveClaimSchema = z.object({
    version: z.number().int().positive(),
    key: z.string().min(1),
    default_name: z.string().min(1).optional(),
});
export type HostedRyveClaim = z.infer<typeof HostedRyveClaimSchema>;

export const ConduitViewSchema = z.object({
    conduit_id: z.string().min(1),
    proxy_id: z.string().min(1),
    role: z.enum(["personal", "common", "public"]).optional(),
    traffic_scope: z.enum(["personal", "public"]).optional(),
    status: ConduitStatusSchema,
    personal_compartment_id: z.string().min(1).optional(),
    common_compartment_id: z.string().min(1).optional(),
    inproxy_public_key: z.string().min(1).optional(),
    ryve_claim: HostedRyveClaimSchema.optional(),
    poll_after_seconds: z.number().int().positive().optional(),
});
export type ConduitView = z.infer<typeof ConduitViewSchema>;

export const ConduitsSnapshotSchema = z.object({
    account: AccountProfileSchema.optional(),
    entitlement: z
        .object({
            status: z.string().min(1),
            product_id: z.string().min(1).optional(),
            expires_at: z.string().min(1).optional(),
            evolution_level: z.coerce.number().int().min(0).max(3).optional(),
        })
        .passthrough(),
    conduits: z.array(ConduitViewSchema),
    poll_after_seconds: z.number().int().positive().optional(),
});
export type ConduitsSnapshot = z.infer<typeof ConduitsSnapshotSchema>;

export const HostedCatalogPlatformSchema = z.enum(["ios", "android"]);
export type HostedCatalogPlatform = z.infer<typeof HostedCatalogPlatformSchema>;

export const HostedPlanCatalogQuerySchema = z.object({
    platform: HostedCatalogPlatformSchema,
    locale: z.string().min(1),
    appVersion: z.string().min(1),
    buildNumber: z.string().min(1).optional(),
    country: z.string().min(2).max(2).optional(),
});
export type HostedPlanCatalogQuery = z.infer<
    typeof HostedPlanCatalogQuerySchema
>;

export const HostedPlanCatalogFallbackPolicySchema = z.enum([
    "show_generic",
    "hide",
    "error",
]);
export type HostedPlanCatalogFallbackPolicy = z.infer<
    typeof HostedPlanCatalogFallbackPolicySchema
>;

export const HostedPlanCatalogStatusSchema = z.enum([
    "active",
    "deprecated",
    "hidden",
]);
export type HostedPlanCatalogStatus = z.infer<
    typeof HostedPlanCatalogStatusSchema
>;

export const HostedPlanCatalogBillingCadenceSchema = z.enum([
    "monthly",
    "yearly",
    "lifetime",
    "other",
]);
export type HostedPlanCatalogBillingCadence = z.infer<
    typeof HostedPlanCatalogBillingCadenceSchema
>;

export const HostedPlanCatalogPlanSchema = z.object({
    id: z.string().min(1),
    status: HostedPlanCatalogStatusSchema,
    sortOrder: z.number().int(),
    mapping: z.object({
        revenueCat: z.object({
            offeringIds: z.array(z.string().min(1)).optional(),
            packageIds: z.array(z.string().min(1)).optional(),
            productIds: z.array(z.string().min(1)).optional(),
            entitlementIds: z.array(z.string().min(1)).optional(),
        }),
    }),
    display: z.object({
        title: z.string().min(1),
        subtitle: z.string().nullable(),
        badge: z.string().nullable(),
        featureBullets: z.array(z.string()),
        marketingCopy: z.string().nullable(),
    }),
    billing: z.object({
        cadence: HostedPlanCatalogBillingCadenceSchema,
    }),
    capabilities: z.record(z.string(), z.unknown()).optional(),
    constraints: z
        .object({
            allowedPlatforms: z.array(HostedCatalogPlatformSchema).optional(),
            minAppVersion: z.string().min(1).optional(),
            countryAllowlist: z.array(z.string().min(2).max(2)).optional(),
            countryBlocklist: z.array(z.string().min(2).max(2)).optional(),
        })
        .optional(),
});
export type HostedPlanCatalogPlan = z.infer<typeof HostedPlanCatalogPlanSchema>;

export const HostedPlanCatalogResponseSchema = z.object({
    catalogVersion: z.string().min(1),
    generatedAt: z.string().min(1),
    currencyDisplayMode: z.literal("revenuecat_price_string"),
    fallbackPolicy: z.object({
        unmappedRevenueCatPackage: HostedPlanCatalogFallbackPolicySchema,
    }),
    plans: z.array(HostedPlanCatalogPlanSchema),
});
export type HostedPlanCatalogResponse = z.infer<
    typeof HostedPlanCatalogResponseSchema
>;

export const StatsSessionRequestSchema = z.object({
    local_proxy_ids: z.array(z.string().min(1)).max(10).optional(),
});
export type StatsSessionRequest = z.infer<typeof StatsSessionRequestSchema>;

export const StatsSessionTargetSourceSchema = z.enum([
    "hosted",
    "local",
    "local_dev_assigned",
]);
export type StatsSessionTargetSource = z.infer<
    typeof StatsSessionTargetSourceSchema
>;

export const StatsSessionTargetSchema = z.object({
    proxy_id: z.string().min(1),
    source: StatsSessionTargetSourceSchema,
    requested_proxy_id: z.string().min(1).optional(),
});
export type StatsSessionTarget = z.infer<typeof StatsSessionTargetSchema>;

export const StatsSessionResponseSchema = z.object({
    stats_token: z.string().min(1),
    expires_in_seconds: z.number().int().positive(),
    targets: z.array(StatsSessionTargetSchema),
});
export type StatsSessionResponse = z.infer<typeof StatsSessionResponseSchema>;

export const SummaryWindowSchema = z.enum(["24h", "7d", "30d"]);
export type SummaryWindow = z.infer<typeof SummaryWindowSchema>;

export const StatsSegmentSchema = z.object({
    active_users: z.number().int().nonnegative(),
    connecting_users: z.number().int().nonnegative(),
    bytes_up: z.number().int().nonnegative(),
    bytes_down: z.number().int().nonnegative(),
});

export const StatsRegionActivitySchema = z.object({
    region: z.string().regex(/^[A-Z]{2}$/),
    connected_users: z.number().int().nonnegative(),
    connecting_users: z.number().int().nonnegative(),
    bytes_up_total: z.number().int().nonnegative(),
    bytes_down_total: z.number().int().nonnegative(),
});

export const StatsSummaryResponseSchema = z.object({
    window: SummaryWindowSchema,
    generated_at: z.string().min(1),
    proxy_id: z.string().min(1),
    segments: z.object({
        personal: StatsSegmentSchema,
        public: StatsSegmentSchema,
    }),
    personal_region_activity: z.array(StatsRegionActivitySchema).default([]),
    public_region_activity: z.array(StatsRegionActivitySchema).default([]),
});
export type StatsSummaryResponse = z.infer<typeof StatsSummaryResponseSchema>;

export const RecentWindowSchema = z.union([
    z.literal("5m"),
    z.literal("48h"),
    z.literal("7d"),
    z.literal("30d"),
]);
export type RecentWindow = z.infer<typeof RecentWindowSchema>;

export const StatsRecentBucketSchema = z.object({
    ts: z.string().min(1),
    personal_active_users: z.number().int().nonnegative(),
    public_active_users: z.number().int().nonnegative(),
    personal_connecting_users: z.number().int().nonnegative(),
    public_connecting_users: z.number().int().nonnegative(),
    personal_bytes_transferred: z.number().int().nonnegative().optional(),
    public_bytes_transferred: z.number().int().nonnegative().optional(),
    bytes_up: z.number().int().nonnegative(),
    bytes_down: z.number().int().nonnegative(),
});

export const StatsRecentResponseSchema = z.object({
    window: RecentWindowSchema,
    bucket_seconds: z.number().int().positive(),
    generated_at: z.string().min(1),
    proxy_id: z.string().min(1),
    series: z.array(StatsRecentBucketSchema),
    personal_region_activity: z.array(StatsRegionActivitySchema).default([]),
    public_region_activity: z.array(StatsRegionActivitySchema).default([]),
});
export type StatsRecentResponse = z.infer<typeof StatsRecentResponseSchema>;

export const StatsLiveSegmentSchema = z.object({
    connected_users: z.number().int().nonnegative(),
    connecting_users: z.number().int().nonnegative(),
    bytes_up_total: z.number().int().nonnegative(),
    bytes_down_total: z.number().int().nonnegative(),
});

export const StatsLiveRegionMetricSchema = StatsRegionActivitySchema;

export const StatsLiveResponseSchema = z.object({
    generated_at: z.string().min(1),
    proxy_id: z.string().min(1),
    announcing: z.number().int().nonnegative(),
    segments: z.object({
        personal: StatsLiveSegmentSchema,
        public: StatsLiveSegmentSchema,
        total: StatsLiveSegmentSchema,
    }),
    personal_region_activity: z.array(StatsLiveRegionMetricSchema),
    public_region_activity: z.array(StatsLiveRegionMetricSchema),
});
export type StatsLiveResponse = z.infer<typeof StatsLiveResponseSchema>;

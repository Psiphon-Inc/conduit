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
import { z } from "zod";

import {
    AccountProfile,
    AccountProfileSchema,
    ConduitsSnapshot,
    ConduitsSnapshotSchema,
    HostedApiErrorSchema,
    HostedCatalogPlatform,
    HostedPlanCatalogQuery,
    HostedPlanCatalogQuerySchema,
    HostedPlanCatalogResponse,
    HostedPlanCatalogResponseSchema,
    PersonalCompartmentId,
    RecentWindow,
    SetPersonalCompartmentIdConflictResponseSchema,
    SetPersonalCompartmentIdRequestSchema,
    SetPersonalCompartmentIdResponseSchema,
    StatsLiveResponse,
    StatsLiveResponseSchema,
    StatsRecentResponse,
    StatsRecentResponseSchema,
    StatsSessionRequest,
    StatsSessionRequestSchema,
    StatsSessionResponse,
    StatsSessionResponseSchema,
    StatsSummaryResponse,
    StatsSummaryResponseSchema,
    SummaryWindow,
    UpdateAccountProfileRequest,
    UpdateAccountProfileRequestSchema,
} from "@/src/hosted/contracts";

const ACCOUNT_PROFILE_PATH = "/v1/account/profile";
const PERSONAL_COMPARTMENT_ID_PATH = "/v1/account/personal-compartment-id";
const CONDUITS_PATH = "/v1/conduits";
const PLAN_CATALOG_PATH = "/v1/hosted/plan-catalog";
const STATS_SESSION_PATH = "/v1/stats/session";
const STATS_SUMMARY_PATH = "/v1/stats/summary";
const STATS_RECENT_PATH = "/v1/stats/recent";
const STATS_LIVE_PATH = "/v1/stats/live";
const DEV_RECONCILE_PATH = "/dev/revenuecat/reconcile";
const DEV_RESET_SELF_PATH = "/dev/state/reset-self";

export class HostedClientRequestError extends Error {
    readonly status: number;
    readonly code?: string;

    constructor(message: string, status: number, code?: string) {
        super(message);
        this.name = "HostedClientRequestError";
        this.status = status;
        this.code = code;
    }
}

export class HostedAccountProfileConflictError extends HostedClientRequestError {
    readonly currentProfile: AccountProfile;

    constructor(currentProfile: AccountProfile) {
        super(
            "Hosted account profile update conflicted",
            409,
            "profile.conflict",
        );
        this.name = "HostedAccountProfileConflictError";
        this.currentProfile = currentProfile;
    }
}

export class HostedPersonalCompartmentIdConflictError extends HostedClientRequestError {
    readonly currentPersonalCompartmentId: PersonalCompartmentId;

    constructor(currentPersonalCompartmentId: PersonalCompartmentId) {
        super(
            "Hosted personal compartment ID conflicted",
            409,
            "personal_compartment_id_conflict",
        );
        this.name = "HostedPersonalCompartmentIdConflictError";
        this.currentPersonalCompartmentId = currentPersonalCompartmentId;
    }
}

export interface HostedClientConfig {
    baseUrl: string;
    fetchImpl?: typeof fetch;
}

export interface HostedDevResetResponse {
    status: string;
    account_id: string;
}

export function createHostedClient(config: HostedClientConfig) {
    const fetchImpl = config.fetchImpl ?? fetch;
    const baseUrl = normalizeBaseUrl(config.baseUrl);

    async function getConduitsSnapshot(
        accessToken: string,
    ): Promise<ConduitsSnapshot> {
        const body = await requestWithBearer(
            fetchImpl,
            baseUrl + CONDUITS_PATH,
            accessToken,
        );
        return ConduitsSnapshotSchema.parse(body);
    }

    async function getAccountProfile(
        accessToken: string,
    ): Promise<AccountProfile> {
        const body = await requestWithBearer(
            fetchImpl,
            baseUrl + ACCOUNT_PROFILE_PATH,
            accessToken,
        );
        return parseAccountProfile(body);
    }

    async function updateAccountProfile(
        accessToken: string,
        request: UpdateAccountProfileRequest,
    ): Promise<AccountProfile> {
        const parsed = UpdateAccountProfileRequestSchema.parse(request);
        const response = await fetchImpl(baseUrl + ACCOUNT_PROFILE_PATH, {
            method: "PATCH",
            cache: "no-store",
            headers: {
                authorization: `Bearer ${accessToken}`,
                "content-type": "application/json",
            },
            body: JSON.stringify(parsed),
        });

        const body = await parseResponseBody(response);
        if (response.status === 409) {
            const currentProfile = parseConflictProfile(body);
            if (currentProfile) {
                throw new HostedAccountProfileConflictError(currentProfile);
            }
        }

        if (!response.ok) {
            const apiErr = HostedApiErrorSchema.safeParse(body);
            if (apiErr.success) {
                throw new HostedClientRequestError(
                    apiErr.data.error.message,
                    response.status,
                    apiErr.data.error.code,
                );
            }
            throw new HostedClientRequestError(
                `Hosted API request failed with status ${response.status}`,
                response.status,
            );
        }

        return parseAccountProfile(body);
    }

    async function setPersonalCompartmentId(
        accessToken: string,
        personalCompartmentId: PersonalCompartmentId,
    ): Promise<PersonalCompartmentId> {
        const parsedRequest = SetPersonalCompartmentIdRequestSchema.parse({
            personal_compartment_id: personalCompartmentId,
        });
        const response = await fetchImpl(
            baseUrl + PERSONAL_COMPARTMENT_ID_PATH,
            {
                method: "POST",
                cache: "no-store",
                headers: {
                    authorization: `Bearer ${accessToken}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify(parsedRequest),
            },
        );

        const body = await parseResponseBody(response);
        if (response.status === 409) {
            const conflict =
                SetPersonalCompartmentIdConflictResponseSchema.safeParse(body);
            if (conflict.success) {
                throw new HostedPersonalCompartmentIdConflictError(
                    conflict.data.current_personal_compartment_id,
                );
            }
        }

        if (!response.ok) {
            const apiErr = HostedApiErrorSchema.safeParse(body);
            if (apiErr.success) {
                throw new HostedClientRequestError(
                    apiErr.data.error.message,
                    response.status,
                    apiErr.data.error.code,
                );
            }
            throw new HostedClientRequestError(
                `Hosted API request failed with status ${response.status}`,
                response.status,
            );
        }

        const parsedResponse =
            SetPersonalCompartmentIdResponseSchema.parse(body);
        return parsedResponse.personal_compartment_id;
    }

    async function getPlanCatalog(
        accessToken: string,
        query: HostedPlanCatalogQuery,
    ): Promise<HostedPlanCatalogResponse> {
        const parsedQuery = HostedPlanCatalogQuerySchema.parse(query);
        const body = await requestWithBearer(
            fetchImpl,
            `${baseUrl}${PLAN_CATALOG_PATH}?${buildPlanCatalogQuery(parsedQuery)}`,
            accessToken,
        );
        return HostedPlanCatalogResponseSchema.parse(body);
    }

    async function createStatsSession(
        accessToken: string,
        request?: StatsSessionRequest,
    ): Promise<StatsSessionResponse> {
        const parsed = StatsSessionRequestSchema.parse(request ?? {});
        const body = await requestWithBearer(
            fetchImpl,
            `${baseUrl}${STATS_SESSION_PATH}`,
            accessToken,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify(parsed),
            },
        );
        return StatsSessionResponseSchema.parse(body);
    }

    async function getSummary(
        statsToken: string,
        window: SummaryWindow,
        proxyId: string,
    ): Promise<StatsSummaryResponse> {
        const query = `window=${window}&proxy_id=${encodeURIComponent(proxyId)}`;
        const body = await requestWithBearer(
            fetchImpl,
            `${baseUrl}${STATS_SUMMARY_PATH}?${query}`,
            statsToken,
        );
        return StatsSummaryResponseSchema.parse(body);
    }

    async function getRecent(
        statsToken: string,
        window: RecentWindow = "5m",
        proxyId: string,
    ): Promise<StatsRecentResponse> {
        const query = `window=${window}&proxy_id=${encodeURIComponent(proxyId)}`;
        const body = await requestWithBearer(
            fetchImpl,
            `${baseUrl}${STATS_RECENT_PATH}?${query}`,
            statsToken,
        );
        return StatsRecentResponseSchema.parse(body);
    }

    async function getLive(
        statsToken: string,
        proxyId: string,
    ): Promise<StatsLiveResponse> {
        const query = `proxy_id=${encodeURIComponent(proxyId)}`;
        const body = await requestWithBearer(
            fetchImpl,
            `${baseUrl}${STATS_LIVE_PATH}?${query}`,
            statsToken,
        );
        return StatsLiveResponseSchema.parse(body);
    }

    async function reconcileRevenueCat(
        accessToken: string,
        appUserId: string,
    ): Promise<void> {
        await requestWithBearer(
            fetchImpl,
            `${baseUrl}${DEV_RECONCILE_PATH}`,
            accessToken,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    app_user_id: appUserId,
                }),
            },
        );
    }

    async function resetDevState(
        accessToken: string,
    ): Promise<HostedDevResetResponse> {
        const body = await requestWithBearer(
            fetchImpl,
            `${baseUrl}${DEV_RESET_SELF_PATH}`,
            accessToken,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({}),
            },
        );

        return body as HostedDevResetResponse;
    }

    return {
        getConduitsSnapshot,
        getAccountProfile,
        updateAccountProfile,
        setPersonalCompartmentId,
        getPlanCatalog,
        createStatsSession,
        getSummary,
        getRecent,
        getLive,
        reconcileRevenueCat,
        resetDevState,
    };
}

function parseConflictProfile(body: unknown): AccountProfile | null {
    const direct = AccountProfileSchema.safeParse(body);
    if (direct.success) {
        return direct.data;
    }

    const wrapped = z
        .object({
            account: AccountProfileSchema.optional(),
            current_profile: AccountProfileSchema.optional(),
        })
        .safeParse(body);
    if (!wrapped.success) {
        return null;
    }

    return wrapped.data.current_profile ?? wrapped.data.account ?? null;
}

function parseAccountProfile(body: unknown): AccountProfile {
    const direct = AccountProfileSchema.safeParse(body);
    if (direct.success) {
        return direct.data;
    }

    const wrapped = z
        .object({
            account: AccountProfileSchema,
        })
        .safeParse(body);
    if (wrapped.success) {
        return wrapped.data.account;
    }

    return AccountProfileSchema.parse(body);
}

async function requestWithBearer(
    fetchImpl: typeof fetch,
    url: string,
    bearerToken: string,
    init?: RequestInit,
): Promise<unknown> {
    const response = await fetchImpl(url, {
        ...init,
        method: init?.method ?? "GET",
        cache: "no-store",
        headers: {
            authorization: `Bearer ${bearerToken}`,
            ...init?.headers,
        },
    });

    const body = await parseResponseBody(response);

    if (!response.ok) {
        const apiErr = HostedApiErrorSchema.safeParse(body);
        if (apiErr.success) {
            throw new HostedClientRequestError(
                apiErr.data.error.message,
                response.status,
                apiErr.data.error.code,
            );
        }
        throw new HostedClientRequestError(
            `Hosted API request failed with status ${response.status}`,
            response.status,
        );
    }

    return body;
}

async function parseResponseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function buildPlanCatalogQuery(query: HostedPlanCatalogQuery): string {
    const params = new URLSearchParams();
    params.set("platform", toCatalogPlatformQueryValue(query.platform));
    params.set("locale", query.locale);
    params.set("appVersion", query.appVersion);
    if (query.buildNumber) {
        params.set("buildNumber", query.buildNumber);
    }
    if (query.country) {
        params.set("country", query.country);
    }
    return params.toString();
}

function toCatalogPlatformQueryValue(platform: HostedCatalogPlatform): string {
    return platform;
}

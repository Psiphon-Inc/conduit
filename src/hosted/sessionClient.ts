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
// Owns hosted authentication, session persistence, and token refresh.
import { base64urlnopad } from "@scure/base";
import { z } from "zod";

import { wrapError } from "@/src/common/errors";
import * as secureStorage from "@/src/common/secureStorage";
import { SECURESTORE_HOSTED_SESSION_KEY } from "@/src/constants";
import {
    AccountProfile,
    HostedLoginRequest,
    HostedLoginRequestSchema,
    RefreshRequestSchema,
    RefreshResponseSchema,
    SessionTokenResponse,
    SessionTokenResponseSchema,
} from "@/src/hosted/contracts";
import { normalizeHostedBaseUrl, requestHostedJson } from "@/src/hosted/http";

const LOGIN_PATH = "/auth/oauth/login";
const REFRESH_PATH = "/auth/refresh";

export interface HostedSession {
    accountId: string;
    accessToken: string;
    accessTokenExpiresAtMs: number;
    refreshToken: string;
    refreshTokenExpiresAtMs: number;
    personalPairingWrapperBaseUrl: string | null;
    accountProfile: AccountProfile | null;
}

interface HostedSessionClientConfig {
    baseUrl: string;
    fetchImpl?: typeof fetch;
    now?: () => number;
}

export class HostedApiRequestError extends Error {
    readonly status: number;
    readonly code?: string;

    constructor(message: string, status: number, code?: string) {
        super(message);
        this.name = "HostedApiRequestError";
        this.status = status;
        this.code = code;
    }
}

export function createHostedSessionClient(config: HostedSessionClientConfig) {
    const fetchImpl = config.fetchImpl ?? fetch;
    const now = config.now ?? (() => Date.now());
    const normalizedBaseUrl = normalizeHostedBaseUrl(config.baseUrl, {
        trimWhitespace: true,
    });
    let refreshInFlight: Promise<HostedSession> | null = null;

    async function login(input: HostedLoginRequest): Promise<HostedSession> {
        const body = HostedLoginRequestSchema.parse(input);

        const responseBody = await requestJson(
            fetchImpl,
            normalizedBaseUrl + LOGIN_PATH,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            },
        );

        const parsed = SessionTokenResponseSchema.parse(responseBody);
        const session = buildSessionFromLogin(parsed, now());
        await persistHostedSession(normalizedBaseUrl, session);
        return session;
    }

    async function refresh(): Promise<HostedSession> {
        if (refreshInFlight) {
            return refreshInFlight;
        }

        refreshInFlight = refreshOnce();
        try {
            return await refreshInFlight;
        } finally {
            refreshInFlight = null;
        }
    }

    async function refreshOnce(): Promise<HostedSession> {
        const existing = await loadHostedSession(normalizedBaseUrl);
        if (existing == null) {
            throw new Error("Hosted session not found");
        }

        const requestBody = RefreshRequestSchema.parse({
            refresh_token: existing.refreshToken,
        });

        const responseBody = await requestJson(
            fetchImpl,
            normalizedBaseUrl + REFRESH_PATH,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(requestBody),
            },
        );

        const parsed = RefreshResponseSchema.parse(responseBody);
        const refreshed: HostedSession = {
            accountId: existing.accountId,
            accessToken: parsed.access_token,
            accessTokenExpiresAtMs:
                now() + parsed.access_token_expires_in_seconds * 1000,
            refreshToken: parsed.refresh_token ?? existing.refreshToken,
            refreshTokenExpiresAtMs:
                parsed.refresh_token_expires_in_seconds != null
                    ? now() + parsed.refresh_token_expires_in_seconds * 1000
                    : existing.refreshTokenExpiresAtMs,
            personalPairingWrapperBaseUrl:
                parsed.personal_pairing_wrapper_base_url ??
                existing.personalPairingWrapperBaseUrl,
            accountProfile: parsed.account ?? existing.accountProfile,
        };

        await persistHostedSession(normalizedBaseUrl, refreshed);
        return refreshed;
    }

    return {
        login,
        refresh,
        loadHostedSession: async () => loadHostedSession(normalizedBaseUrl),
        persistHostedSession: async (session: HostedSession) =>
            persistHostedSession(normalizedBaseUrl, session),
        clearHostedSession: async () => clearHostedSession(normalizedBaseUrl),
    };
}

export async function loadHostedSession(
    baseUrl: string,
): Promise<HostedSession | null> {
    const normalizedBaseUrl = normalizeHostedBaseUrl(baseUrl, {
        trimWhitespace: true,
    });
    const raw = await secureStorage.getItemAsync(
        storageKeyForBaseUrl(normalizedBaseUrl),
    );
    if (raw == null) {
        return await migrateLegacyHostedSession(normalizedBaseUrl);
    }

    try {
        const parsed = HostedStoredSessionSchema.parse(JSON.parse(raw));
        if (
            normalizeHostedBaseUrl(parsed.baseUrl, { trimWhitespace: true }) !==
            normalizedBaseUrl
        ) {
            throw new Error("Hosted session base URL mismatch");
        }
        return parsed.session;
    } catch (error) {
        throw wrapError(error, "Invalid hosted session state");
    }
}

export async function persistHostedSession(
    baseUrl: string,
    session: HostedSession,
): Promise<void> {
    const normalizedBaseUrl = normalizeHostedBaseUrl(baseUrl, {
        trimWhitespace: true,
    });
    const parsed = HostedSessionSchema.parse(session);
    await secureStorage.setItemAsync(
        storageKeyForBaseUrl(normalizedBaseUrl),
        JSON.stringify({
            baseUrl: normalizedBaseUrl,
            session: parsed,
        }),
    );
    await secureStorage.deleteItemAsync(SECURESTORE_HOSTED_SESSION_KEY);
}

export async function clearHostedSession(baseUrl: string): Promise<void> {
    await secureStorage.deleteItemAsync(
        storageKeyForBaseUrl(
            normalizeHostedBaseUrl(baseUrl, { trimWhitespace: true }),
        ),
    );
    await secureStorage.deleteItemAsync(SECURESTORE_HOSTED_SESSION_KEY);
}

async function requestJson(
    fetchImpl: typeof fetch,
    url: string,
    init: RequestInit,
): Promise<unknown> {
    return requestHostedJson(fetchImpl, url, init, {
        telemetryClient: "hosted-session",
        createRequestError: createSessionRequestError,
        // Session endpoints must never accept proxy/LB HTML as a response body.
        onInvalidJson: (status) =>
            new HostedApiRequestError(
                `Server is currently unavailable (HTTP ${status})`,
                status,
            ),
    });
}

function storageKeyForBaseUrl(baseUrl: string): string {
    const encodedBaseUrl = base64urlnopad.encode(
        new TextEncoder().encode(baseUrl),
    );
    return `${SECURESTORE_HOSTED_SESSION_KEY}.${encodedBaseUrl}`;
}

async function migrateLegacyHostedSession(
    normalizedBaseUrl: string,
): Promise<HostedSession | null> {
    // Retain migration while already-persisted unsuffixed sessions may exist.
    const raw = await secureStorage.getItemAsync(
        SECURESTORE_HOSTED_SESSION_KEY,
    );
    if (raw == null) {
        return null;
    }

    try {
        const legacySession = HostedSessionSchema.parse(JSON.parse(raw));
        await persistHostedSession(normalizedBaseUrl, legacySession);
        return legacySession;
    } catch (error) {
        throw wrapError(error, "Invalid hosted session state");
    }
}

function createSessionRequestError(
    message: string,
    status: number,
    code?: string,
): HostedApiRequestError {
    return new HostedApiRequestError(message, status, code);
}

function buildSessionFromLogin(
    response: SessionTokenResponse,
    nowMs: number,
): HostedSession {
    return {
        accountId: response.account_id,
        accessToken: response.access_token,
        accessTokenExpiresAtMs:
            nowMs + response.access_token_expires_in_seconds * 1000,
        refreshToken: response.refresh_token,
        refreshTokenExpiresAtMs:
            nowMs + response.refresh_token_expires_in_seconds * 1000,
        personalPairingWrapperBaseUrl:
            response.personal_pairing_wrapper_base_url ?? null,
        accountProfile: response.account ?? null,
    };
}

const HostedSessionSchema = z.object({
    accountId: z.string().min(1),
    accessToken: z.string().min(1),
    accessTokenExpiresAtMs: z.number().int().positive(),
    refreshToken: z.string().min(1),
    refreshTokenExpiresAtMs: z.number().int().positive(),
    personalPairingWrapperBaseUrl: z.string().min(1).nullable().default(null),
    accountProfile: z
        .object({
            alias: z.string(),
            alias_is_default: z.boolean(),
            profile_version: z.number().int().nonnegative(),
        })
        .nullable()
        .default(null),
});

const HostedStoredSessionSchema = z.object({
    baseUrl: z.string().min(1),
    session: HostedSessionSchema,
});

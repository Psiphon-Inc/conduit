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
import { HostedApiErrorSchema } from "@/src/hosted/contracts";
import {
    recordClientEventError,
    sanitizeUrlForClientEvent,
} from "@/src/telemetry/clientEvents";

type HostedRequestErrorFactory = (
    message: string,
    status: number,
    code?: string,
) => Error;

interface NormalizeHostedBaseUrlOptions {
    trimWhitespace?: boolean;
}

interface ParseHostedResponseBodyOptions {
    onInvalidJson?: (status: number) => Error;
}

interface HostedRequestOptions extends ParseHostedResponseBodyOptions {
    telemetryClient: string;
    createRequestError: HostedRequestErrorFactory;
}

interface HostedBearerRequestOptions extends HostedRequestOptions {
    init?: RequestInit;
}

export function normalizeHostedBaseUrl(
    baseUrl: string,
    options: NormalizeHostedBaseUrlOptions = {},
): string {
    const normalized = options.trimWhitespace ? baseUrl.trim() : baseUrl;
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export async function parseHostedResponseBody(
    response: Response,
    options: ParseHostedResponseBodyOptions = {},
): Promise<unknown> {
    const text = await response.text();
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text) as unknown;
    } catch {
        if (options.onInvalidJson) {
            throw options.onInvalidJson(response.status);
        }
        return text;
    }
}

export function createHostedResponseError(
    body: unknown,
    status: number,
    createRequestError: HostedRequestErrorFactory,
): Error {
    const apiError = HostedApiErrorSchema.safeParse(body);
    if (apiError.success) {
        return createRequestError(
            apiError.data.error.message,
            status,
            apiError.data.error.code,
        );
    }
    return createRequestError(
        `Hosted API request failed with status ${status}`,
        status,
    );
}

export async function fetchHostedResponse(
    fetchImpl: typeof fetch,
    url: string,
    init: RequestInit,
    telemetryClient: string,
): Promise<Response> {
    try {
        return await fetchImpl(url, init);
    } catch (error) {
        recordClientEventError("hosted.api.fetch_failed", error, {
            client: telemetryClient,
            method: String(init.method ?? "GET").toUpperCase(),
            url: sanitizeUrlForClientEvent(url),
        });
        throw error;
    }
}

export async function requestHostedJson(
    fetchImpl: typeof fetch,
    url: string,
    init: RequestInit,
    options: HostedRequestOptions,
): Promise<unknown> {
    const response = await fetchHostedResponse(
        fetchImpl,
        url,
        init,
        options.telemetryClient,
    );
    const body = await parseHostedResponseBody(response, options);

    if (!response.ok) {
        throw createHostedResponseError(
            body,
            response.status,
            options.createRequestError,
        );
    }

    return body;
}

export async function requestHostedJsonWithBearer(
    fetchImpl: typeof fetch,
    url: string,
    bearerToken: string,
    options: HostedBearerRequestOptions,
): Promise<unknown> {
    const init = options.init;
    return requestHostedJson(
        fetchImpl,
        url,
        {
            ...init,
            method: init?.method ?? "GET",
            cache: "no-store",
            headers: {
                authorization: `Bearer ${bearerToken}`,
                ...init?.headers,
            },
        },
        options,
    );
}

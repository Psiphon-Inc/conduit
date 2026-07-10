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
/**
 * Privacy note: despite the "telemetry"/"event" naming, everything in
 * this module is console-only structured logging. Nothing recorded here
 * is transmitted off-device.
 */

export type ClientEventProperties = Record<string, unknown>;

export function recordClientEvent(
    name: string,
    properties: ClientEventProperties = {},
): void {
    console.log("[client-event]", name, properties);
}

export function recordClientEventError(
    name: string,
    error: unknown,
    properties: ClientEventProperties = {},
): void {
    console.error("[client-event-error]", name, properties, error);
    recordClientEvent(name, {
        ...properties,
        error: summarizeError(error),
    });
}

export function recordClientEventErrorOnce(
    name: string,
    error: unknown,
    properties: ClientEventProperties = {},
): void {
    const key = JSON.stringify({
        name,
        properties,
        error: summarizeError(error),
    });
    if (loggedErrorEvents.has(key)) {
        return;
    }
    loggedErrorEvents.add(key);

    recordClientEventError(name, error, properties);
}

export function recordClientEventProblem(
    name: string,
    message: string,
    properties: ClientEventProperties = {},
): void {
    const nextProperties = {
        ...properties,
        message,
        error: {
            name: "Error",
            message,
        },
    };
    console.error("[client-event-error]", name, nextProperties);
    recordClientEvent(name, nextProperties);
}

export function recordClientEventProblemOnce(
    name: string,
    message: string,
    properties: ClientEventProperties = {},
): void {
    const key = JSON.stringify({ name, message, properties });
    if (loggedErrorEvents.has(key)) {
        return;
    }
    loggedErrorEvents.add(key);

    recordClientEventProblem(name, message, properties);
}

export function recordVisibleClientError(
    message: string,
    properties: ClientEventProperties = {},
): void {
    recordClientEventProblemOnce("ui.visible_error", message, {
        ...properties,
        message,
    });
}

export function sanitizeUrlForClientEvent(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        return url.split("?")[0];
    }
}

export function summarizeClientEventKey(key: readonly unknown[]): unknown[] {
    return key.map(summarizeClientEventValue);
}

const loggedErrorEvents = new Set<string>();

function summarizeClientEventValue(value: unknown): unknown {
    if (typeof value === "string") {
        if (value.startsWith("http://") || value.startsWith("https://")) {
            return sanitizeUrlForClientEvent(value);
        }
        return value.length > 32 ? "[redacted]" : value;
    }

    if (Array.isArray(value)) {
        return value.map(summarizeClientEventValue);
    }

    if (value && typeof value === "object") {
        return "[object]";
    }

    return value;
}

function summarizeError(error: unknown): ClientEventProperties {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
        };
    }

    return {
        name: "NonError",
        message: String(error),
    };
}

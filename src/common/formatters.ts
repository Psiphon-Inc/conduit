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
 * Shared formatting utilities for bytes and timestamps.
 */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export interface FormatBytesOptions {
    /**
     * "significant" (default): up to 4 significant digits per value,
     * switching tiers at 999.95 so the mantissa never exceeds 4 digits
     * (e.g. "849.3 MB", "3.543 GB", "45.12 KB"). Used for chart axis
     * labels. Negative values are preserved.
     *
     * "fixed": one decimal place on intermediate tiers and two on the
     * top tier, switching tiers at 1000 (e.g. "1.5 MB", "2.50 GB").
     * Non-positive values are clamped to "0 B".
     */
    precision?: "significant" | "fixed";
    /** Highest unit tier to scale to. Defaults to "TB". */
    maxUnit?: "GB" | "TB";
    /** Render the kilobyte tier as "kB" instead of "KB". */
    lowercaseKilo?: boolean;
}

/**
 * Formats a byte count into a compact human-readable string that scales
 * through B, KB, MB, GB, and TB using decimal (1000-based) tiers. See
 * FormatBytesOptions for the available output styles.
 */
export function formatBytes(
    bytes: number,
    options: FormatBytesOptions = {},
): string {
    const {
        precision = "significant",
        maxUnit = "TB",
        lowercaseKilo = false,
    } = options;

    if (!Number.isFinite(bytes) || (precision === "fixed" && bytes <= 0)) {
        return "0 B";
    }

    const maxUnitIndex = BYTE_UNITS.indexOf(maxUnit);
    const tierThreshold = precision === "significant" ? 999.95 : 1000;

    let value = bytes;
    let unitIndex = 0;
    while (Math.abs(value) >= tierThreshold && unitIndex < maxUnitIndex) {
        value /= 1_000;
        unitIndex++;
    }

    const unit =
        unitIndex === 1 && lowercaseKilo ? "kB" : BYTE_UNITS[unitIndex];

    if (precision === "significant") {
        const absValue = Math.abs(value);
        if (unitIndex === 0) {
            return `${Math.round(value)} ${unit}`;
        }
        if (absValue >= 100) {
            return `${value.toFixed(1)} ${unit}`;
        }
        if (absValue >= 10) {
            return `${value.toFixed(2)} ${unit}`;
        }
        return `${value.toFixed(3)} ${unit}`;
    }

    if (unitIndex === 0) {
        return `${value.toFixed(0)} ${unit}`;
    }
    if (unitIndex === maxUnitIndex) {
        return `${value.toFixed(2)} ${unit}`;
    }
    return `${value.toFixed(1)} ${unit}`;
}

/**
 * Formats a nullable ISO timestamp string into a human-readable time
 * for display, or null when no timestamp is available. Callers are
 * responsible for wrapping the time in a localized label.
 */
export function formatUpdatedAtTime(timestamp: string | null): string | null {
    if (!timestamp) {
        return null;
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return timestamp;
    }

    return date.toLocaleTimeString();
}

const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

/**
 * Formats an ISO date string as "May 27, 16:13:10 UTC" ("en" locale),
 * localized via Intl.DateTimeFormat when available with a fallback to
 * the English rendering. Returns an empty string for null/undefined,
 * or the raw input if unparseable.
 */
export function formatExpiresAt(
    iso: string | null | undefined,
    locale = "en",
): string {
    if (!iso) {
        return "";
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
        return iso;
    }
    try {
        if (typeof Intl !== "undefined" && "DateTimeFormat" in Intl) {
            return new Intl.DateTimeFormat(locale, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hourCycle: "h23",
                timeZone: "UTC",
                timeZoneName: "short",
            }).format(d);
        }
    } catch {
        // ignore and fall through to the English rendering
    }
    const month = MONTH_NAMES[d.getUTCMonth()];
    const day = d.getUTCDate();
    const h = String(d.getUTCHours()).padStart(2, "0");
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    const s = String(d.getUTCSeconds()).padStart(2, "0");
    return `${month} ${day}, ${h}:${m}:${s} UTC`;
}

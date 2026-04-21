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

/**
 * Formats a byte count into a compact human-readable string that scales
 * through B, KB, MB, GB, and TB with up to 4 significant digits
 * (e.g. "849.3 MB", "3.543 GB", "45.12 KB"). Used for chart axis labels
 * and status panel values.
 */
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number): string {
    const abs = Math.abs(bytes);
    if (!Number.isFinite(abs)) {
        return "0 B";
    }

    let value = bytes;
    let unitIndex = 0;
    while (Math.abs(value) >= 999.95 && unitIndex < BYTE_UNITS.length - 1) {
        value /= 1_000;
        unitIndex++;
    }

    const unit = BYTE_UNITS[unitIndex];
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

/**
 * Formats a byte count into a human-readable string with B/KB/MB/GB units
 * and consistent decimal precision per tier.
 */
export function formatBytesWithUnit(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "0 B";
    }
    if (bytes < 1000) {
        return `${bytes.toFixed(0)} B`;
    }
    if (bytes < 1000 * 1000) {
        return `${(bytes / 1000).toFixed(1)} KB`;
    }
    if (bytes < 1000 * 1000 * 1000) {
        return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
    }
    return `${(bytes / (1000 * 1000 * 1000)).toFixed(2)} GB`;
}

/**
 * Formats a byte count into a short label string (e.g. "1.2 MB").
 */
export function formatByteLabel(bytes: number): string {
    if (bytes < 1000) {
        return `${bytes} B`;
    }
    if (bytes < 1000 * 1000) {
        return `${(bytes / 1000).toFixed(1)} KB`;
    }
    if (bytes < 1000 * 1000 * 1000) {
        return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
    }
    return `${(bytes / (1000 * 1000 * 1000)).toFixed(1)} GB`;
}

/**
 * Formats a nullable ISO timestamp string into a human-readable
 * "Updated at ..." label for display.
 */
export function formatUpdatedAt(timestamp: string | null): string {
    if (!timestamp) {
        return "Updated at --";
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return `Updated at ${timestamp}`;
    }

    return `Updated at ${date.toLocaleTimeString()}`;
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
 * Formats an ISO date string as "May 27, 16:13:10 UTC".
 * Returns an empty string for null/undefined, or the raw input if unparseable.
 */
export function formatExpiresAt(iso: string | null | undefined): string {
    if (!iso) {
        return "";
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
        return iso;
    }
    const month = MONTH_NAMES[d.getUTCMonth()];
    const day = d.getUTCDate();
    const h = String(d.getUTCHours()).padStart(2, "0");
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    const s = String(d.getUTCSeconds()).padStart(2, "0");
    return `${month} ${day}, ${h}:${m}:${s} UTC`;
}

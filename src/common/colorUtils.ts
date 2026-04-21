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
 * Color manipulation utilities for Reanimated worklet contexts.
 *
 * Functions annotated with "worklet" can run on the Reanimated UI thread.
 */

/**
 * Converts an `rgb(...)` color string to `rgba(...)` with a specified alpha.
 */
export function rgbaFromRgb(rgb: string, alpha: number): string {
    "worklet";
    const trimmed = rgb.trim();
    const clampedAlpha = Math.max(0, Math.min(1, alpha));
    if (trimmed.startsWith("rgb(")) {
        return trimmed.replace(/^rgb\(([^)]+)\)$/i, `rgba($1,${clampedAlpha})`);
    }
    return `rgba(${trimmed},${clampedAlpha})`;
}

/**
 * Multiplies the alpha channel of an `rgba(...)` or `rgb(...)` color string
 * by a given multiplier.
 */
export function multiplyColorAlpha(color: string, multiplier: number): string {
    "worklet";
    const trimmed = color.trim();
    const clamped = Math.max(0, multiplier);
    const rgba = trimmed.match(/^rgba\(([^)]+),\s*([0-9.]+)\)$/i);
    if (rgba) {
        const channels = rgba[1];
        const alpha = Number.parseFloat(rgba[2]);
        const nextAlpha = Math.max(0, Math.min(1, alpha * clamped));
        return `rgba(${channels},${nextAlpha})`;
    }
    const rgb = trimmed.match(/^rgb\(([^)]+)\)$/i);
    if (rgb) {
        const nextAlpha = Math.max(0, Math.min(1, clamped));
        return `rgba(${rgb[1]},${nextAlpha})`;
    }
    return color;
}

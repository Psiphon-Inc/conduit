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
 * Normalizes an i18n language tag to match a supported language option,
 * with exact, base, and regional fallback matching.
 *
 * @param languageTag - The raw language tag (e.g. "pt_BR", "fa-IR", "en")
 * @param supportedCodes - Array of supported language codes to match against
 * @param fallback - The default code to return if no match is found
 */
export function normalizeLanguageCode(
    languageTag: string,
    supportedCodes: string[],
    fallback: string = "en",
): string {
    const normalizedTag = languageTag.trim().replaceAll("_", "-").toLowerCase();
    const exactMatch = supportedCodes.find(
        (code) => code.toLowerCase() === normalizedTag,
    );
    if (exactMatch) {
        return exactMatch;
    }

    const base = normalizedTag.split("-")[0];
    const baseMatch = supportedCodes.find(
        (code) => code.toLowerCase() === base,
    );
    if (baseMatch) {
        return baseMatch;
    }

    const regionalMatch = supportedCodes.find((code) =>
        code.toLowerCase().startsWith(`${base}-`),
    );
    if (regionalMatch) {
        return regionalMatch;
    }

    return fallback;
}

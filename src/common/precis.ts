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
 * PRECIS Nickname Transformer
 *
 * Implementation of RFC 8266 §2.1 Additional Mapping Rules for nicknames
 * https://datatracker.ietf.org/doc/html/rfc8266
 */
import { z } from "zod";

export const MIN_NICKNAME_LENGTH = 3;
export const MAX_NICKNAME_LENGTH = 32;
const DISALLOWED_NICKNAME_PATTERN = /[^\p{L}\p{N}\p{M}\-._ ']/u;
const DISALLOWED_NICKNAME_PATTERN_GLOBAL = /[^\p{L}\p{N}\p{M}\-._ ']/gu;

const PROTECTED_NAMES = [
    "admin",
    "superuser",
    "root",
    "administrator",
    "system",
    "guest",
    "moderator",
    "owner",
    "support",
    "service",
    "operator",
    "rootuser",
    "null",
    "undefined",
    "anonymous",
    "default",
    "unknown",
    "security",
    "auth",
    "login",
    "signup",
    "password",
    "token",
    "api",
    "bot",
    "webmaster",
    "adminpanel",
    "bitcoin",
    "abuse",
    "psiphon",
    "ryve",
    "oat",
    "crypto",
    "gnosis",
    "ethereum",
];

function isProtectedName(name: string): boolean {
    return PROTECTED_NAMES.includes(name.toLowerCase());
}

function isNonAsciiSpace(char: string): boolean {
    const codePoint = char.codePointAt(0);
    if (!codePoint) return false;

    // Check if it's in Zs category but not ASCII space (U+0020)
    return /\p{Zs}/u.test(char) && codePoint !== 0x0020;
}

function isApostropheLike(char: string): boolean {
    return /[\u2018\u2019\u02BC\uFF07]/u.test(char);
}

/**
 * Count the number of runes in a string.
 *
 * This counts the runes rather than the characters, which is necessary for Unicode strings
 * because some characters are composed of multiple code points.
 */
export function countRunes(str: string): number {
    return Array.from(str).length;
}

/**
 * Transform a nickname string according to PRECIS NicknameClass rules (RFC 8266)
 * Preserves case but fixes spacing and width issues.
 *
 * This implements the additional mapping rules for nicknames:
 * - Map non-ASCII spaces to ASCII space
 * - Remove spaces at the beginning and end
 * - Map interior sequences of multiple spaces to a single space
 *
 * The inProgress value is used to determine if this is realtime normalization or if this
 * is a final normalization of a nickname. We do not want to trim whitespace if it is a
 * name in progress
 */
export function normalizeNickname(input: string, inProgress?: boolean): string {
    if (!input) return "";

    // Use ASCII space for all whitespace
    let result = "";
    for (const char of input) {
        if (isNonAsciiSpace(char)) {
            result += " ";
        } else if (isApostropheLike(char)) {
            result += "'";
        } else {
            result += char;
        }
    }

    // Remove extraneous whitespace
    if (!inProgress) {
        result = result.trim();
    }
    result = result.replace(/\s+/g, " ");

    // Apply Unicode normalization
    result = result.normalize("NFKC");

    return result;
}

/**
 * Validates if a string is a valid PRECIS nickname with additional restrictions
 */
export function isValidNickname(nickname: string): boolean {
    if (!nickname || nickname.length === 0) return false;

    // Transform the nickname (spacing only, preserve case)
    const normalized = normalizeNickname(nickname);

    // If the nickname was not already normalized and needs to be, it is not valid
    if (nickname !== normalized) {
        return false;
    }

    // Check length after normalization (customize these limits as needed)
    if (
        countRunes(nickname) < MIN_NICKNAME_LENGTH ||
        countRunes(nickname) > MAX_NICKNAME_LENGTH
    ) {
        return false;
    }

    if (isProtectedName(nickname)) {
        return false;
    }

    // Check for disallowed characters
    return !DISALLOWED_NICKNAME_PATTERN.test(nickname);
}

export function migrateLegacyNickname(nickname: string): string {
    if (!nickname) {
        return "";
    }

    let migrated = normalizeNickname(nickname);
    migrated = normalizeNickname(
        migrated.replace(DISALLOWED_NICKNAME_PATTERN_GLOBAL, ""),
    );

    if (countRunes(migrated) > MAX_NICKNAME_LENGTH) {
        migrated = normalizeNickname(
            Array.from(migrated).slice(0, MAX_NICKNAME_LENGTH).join(""),
        );
    }

    return isValidNickname(migrated) ? migrated : "";
}

export const precisNickname = z
    .string()
    .refine((nickname) => isValidNickname(normalizeNickname(nickname)), {
        message: "Invalid nickname, not PRECIS!",
    });

export type PrecisNickname = z.infer<typeof precisNickname>;

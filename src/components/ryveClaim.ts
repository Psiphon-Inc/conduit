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
import { base64url } from "@scure/base";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { z } from "zod";

import { isValidNickname, normalizeNickname } from "@/src/common/precis";
import {
    RYVE_APP_LISTING_GOOGLE,
    RYVE_CLAIM_DEEP_LINK,
    RYVE_LEARN_MORE_URL,
} from "@/src/constants";

export const RyveClaimMaterialSchema = z.object({
    version: z.number().int().positive(),
    key: z.string().length(86, { message: "INVALID_QR_CODE_I18N.string" }),
    default_name: z.string().optional(),
});

export type RyveClaimMaterial = z.infer<typeof RyveClaimMaterialSchema>;

/**
 * Picks the first non-blank candidate name, normalizes it per PRECIS,
 * and returns it only if it passes validation. Returns undefined if
 * no candidate is valid.
 */
export function resolvePreferredRyveName(
    ...candidates: Array<null | string | undefined>
): string | undefined {
    for (const candidate of candidates) {
        if (!candidate) continue;
        const normalized = normalizeNickname(candidate);
        if (normalized.length > 0 && isValidNickname(normalized)) {
            return normalized;
        }
    }
    return undefined;
}

export function getRyveInstallUrl(platform = Platform.OS): string {
    return platform === "android"
        ? RYVE_APP_LISTING_GOOGLE
        : RYVE_LEARN_MORE_URL;
}

export async function canOpenRyveClaimDeepLink(
    claimDeepLink: string,
): Promise<boolean> {
    try {
        return await Linking.canOpenURL(claimDeepLink);
    } catch {
        return false;
    }
}

export function buildRyveClaimDeepLink(
    claim: RyveClaimMaterial,
    preferredName?: null | string,
): string {
    const material = RyveClaimMaterialSchema.parse(claim);
    const resolvedName = resolvePreferredRyveName(
        preferredName,
        material.default_name,
    );

    const data = {
        key: material.key,
        ...(resolvedName ? { name: resolvedName } : {}),
    };
    const payload = {
        data,
        version: material.version,
    };

    return `${RYVE_CLAIM_DEEP_LINK}${base64url.encode(new TextEncoder().encode(JSON.stringify(payload)))}`;
}

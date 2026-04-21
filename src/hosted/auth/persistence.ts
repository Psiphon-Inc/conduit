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
import * as SecureStore from "expo-secure-store";
import { z } from "zod";

import { SECURESTORE_HOSTED_LAST_AUTH_PROVIDER_KEY } from "@/src/constants";
import { OAuthProvider, OAuthProviderSchema } from "@/src/hosted/contracts";

const HostedAuthProviderHintSchema = z.object({
    baseUrl: z.string().min(1),
    provider: OAuthProviderSchema,
});

export async function loadHostedLastAuthProvider(
    baseUrl: string,
): Promise<OAuthProvider | null> {
    const raw = await SecureStore.getItemAsync(
        SECURESTORE_HOSTED_LAST_AUTH_PROVIDER_KEY,
    );
    if (raw == null) {
        return null;
    }

    try {
        const parsed = HostedAuthProviderHintSchema.parse(JSON.parse(raw));
        if (normalizeBaseUrl(parsed.baseUrl) !== normalizeBaseUrl(baseUrl)) {
            return null;
        }
        return parsed.provider;
    } catch {
        await clearHostedLastAuthProvider();
        return null;
    }
}

export async function persistHostedLastAuthProvider(
    baseUrl: string,
    provider: OAuthProvider,
): Promise<void> {
    const parsed = HostedAuthProviderHintSchema.parse({
        baseUrl: normalizeBaseUrl(baseUrl),
        provider,
    });
    await SecureStore.setItemAsync(
        SECURESTORE_HOSTED_LAST_AUTH_PROVIDER_KEY,
        JSON.stringify(parsed),
    );
}

export async function clearHostedLastAuthProvider(): Promise<void> {
    await SecureStore.deleteItemAsync(
        SECURESTORE_HOSTED_LAST_AUTH_PROVIDER_KEY,
    );
}

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.trim().replace(/\/$/, "");
}

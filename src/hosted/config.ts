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
import { OAuthProvider } from "@/src/hosted/contracts";
import { RevenueCatPublicKeys } from "@/src/hosted/revenuecatClient";

export interface HostedRuntimeConfig {
    baseUrl: string;
    revenueCatPublicKeys?: RevenueCatPublicKeys;
    defaultProvider: OAuthProvider;
    devSimulatedDataEnabled: boolean;
}

export function readHostedRuntimeConfig(): HostedRuntimeConfig {
    // NOTE: process.env.EXPO_PUBLIC_* must be referenced statically (not via
    // a helper that does process.env[name]) so that babel-preset-expo can
    // inline the values at build time.  Dynamic access like process.env[name]
    // is left as-is and resolves to undefined in production iOS/Android
    // bundles where there is no Node.js environment.
    const baseUrl = trimOrEmpty(process.env.EXPO_PUBLIC_HOSTED_BASE_URL);
    const provider = trimOrUndefined(process.env.EXPO_PUBLIC_HOSTED_PROVIDER);
    const defaultProvider: OAuthProvider =
        provider === "apple" ? "apple" : "google";

    return {
        baseUrl,
        defaultProvider,
        revenueCatPublicKeys: readRevenueCatPublicKeys(),
        devSimulatedDataEnabled:
            parseBool(process.env.EXPO_PUBLIC_DEV_SIMULATED_DATA) ??
            parseBool(process.env.DEV_SIMULATED_DATA) ??
            false,
    };
}

function readRevenueCatPublicKeys(): RevenueCatPublicKeys | undefined {
    const ios = trimOrUndefined(
        process.env.EXPO_PUBLIC_REVENUECAT_IOS_PUBLIC_KEY,
    );
    const android = trimOrUndefined(
        process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_KEY,
    );
    if (!ios && !android) {
        return undefined;
    }

    return { ios, android };
}

function trimOrEmpty(value: string | undefined): string {
    return value?.trim() ?? "";
}

function trimOrUndefined(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function parseBool(value: string | undefined): boolean | undefined {
    const normalized = value?.trim()?.toLowerCase();
    if (!normalized) {
        return undefined;
    }
    if (normalized === "1" || normalized === "true" || normalized === "yes") {
        return true;
    }
    if (normalized === "0" || normalized === "false" || normalized === "no") {
        return false;
    }
    return undefined;
}

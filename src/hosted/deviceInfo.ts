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
import Constants from "expo-constants";
import { getLocales } from "expo-localization";

import { getAppVersion } from "@/src/buildInfo";
import type { HostedPlanCatalogQuery } from "@/src/hosted/contracts";
import { resolveHostedCatalogPlatform } from "@/src/hosted/platform";

/**
 * Constructs a plan catalog query with platform, locale, version, and country.
 */
export function buildHostedPlanCatalogQuery(): HostedPlanCatalogQuery {
    return {
        platform: resolveHostedCatalogPlatform(),
        locale: getHostedLocale(),
        appVersion: getHostedAppVersion(),
        buildNumber: getHostedBuildNumber(),
        country: getHostedCountry(),
    };
}

/**
 * Reads the device locale via getLocales(), falling back to "en-US".
 */
function getHostedLocale(): string {
    const locale = getLocales()[0]?.languageTag;
    if (!locale) {
        return "en-US";
    }
    const normalized = locale.trim();
    return normalized.length > 0 ? normalized : "en-US";
}

/**
 * Reads the device country code via getLocales().
 */
function getHostedCountry(): string | undefined {
    const region = getLocales()[0]?.regionCode;
    if (!region) {
        return undefined;
    }
    const normalized = region.trim().toUpperCase();
    return normalized.length === 2 ? normalized : undefined;
}

/**
 * Reads the app version from Expo runtime metadata, falling back to app.json.
 */
function getHostedAppVersion(): string {
    return getAppVersion();
}

/**
 * Reads the build number from Expo config across multiple sources.
 */
function getHostedBuildNumber(): string | undefined {
    if (
        typeof Constants.nativeBuildVersion === "string" &&
        Constants.nativeBuildVersion.trim().length > 0
    ) {
        return Constants.nativeBuildVersion.trim();
    }

    const iosBuild = Constants.expoConfig?.ios?.buildNumber;
    if (typeof iosBuild === "string" && iosBuild.trim().length > 0) {
        return iosBuild.trim();
    }

    const androidBuild = Constants.expoConfig?.android?.versionCode;
    if (typeof androidBuild === "number" && Number.isFinite(androidBuild)) {
        return String(androidBuild);
    }

    return undefined;
}

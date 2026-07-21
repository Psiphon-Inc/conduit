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
import appConfig from "@/app.json";
import Constants from "expo-constants";

import { GIT_HASH } from "@/src/git-hash";

export function getAppVersion(): string {
    return firstNonEmptyString(
        Constants.expoConfig?.version,
        Constants.nativeApplicationVersion,
        appConfig.expo?.version,
    );
}

export function getBuildHash(): string {
    return firstNonEmptyString(GIT_HASH);
}

export function getDisplayBuildVersion(): string {
    const appVersion = getAppVersion();
    const buildHash = getBuildHash();
    if (buildHash === "unknown") {
        return `v${appVersion}`;
    }

    return `v${appVersion} (${buildHash.substring(0, 12)})`;
}

export function getHostedClientVersion(): string {
    return `conduit-${getAppVersion()}-${getBuildHash()}`;
}

function firstNonEmptyString(...values: Array<unknown>): string {
    for (const value of values) {
        if (typeof value !== "string") {
            continue;
        }
        const trimmed = value.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }

    return "unknown";
}

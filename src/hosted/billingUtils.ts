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
import { readOptionalStringField } from "@/src/common/recordUtils";

/**
 * Searches an entitlement record for a billing URL across multiple
 * candidate field names and resolves relative paths against a base URL.
 */
export function resolveManageBillingUrl(
    baseUrl: string,
    entitlementSnapshot: Record<string, unknown> | null,
): string | null {
    const candidates = [
        readOptionalStringField(entitlementSnapshot, "manage_billing_url"),
        readOptionalStringField(entitlementSnapshot, "billing_portal_url"),
        readOptionalStringField(entitlementSnapshot, "manage_billing_path"),
    ];

    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }
        if (/^https?:\/\//i.test(candidate)) {
            return candidate;
        }
        if (candidate.startsWith("/") && baseUrl) {
            return `${baseUrl}${candidate}`;
        }
    }

    return null;
}

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
import { ConduitStatus } from "@/src/hosted/contracts";
import {
    HostedExperienceState,
    HostedStationPhase,
} from "@/src/hosted/experience/types";
import {
    HostedEntitlementStatus,
    HostedEntitlementStatusSchema,
} from "@/src/hosted/revenuecatEntitlements";

export function createInitialHostedExperienceState(): HostedExperienceState {
    return {
        authPhase: "signed_out",
        session: null,
        authError: null,
        revenuecatPhase: "uninitialized",
        revenuecatError: null,
        stationPhase: "none",
        stationError: null,
        accountProfile: null,
        conduitsSnapshot: null,
        entitlementSnapshot: "inactive",
        polling: {
            nextPollAt: null,
            pollAfterSeconds: null,
            lastError: null,
        },
        lastUpdatedAtMs: null,
    };
}

export function deriveHostedStationPhaseFromConduits(
    statuses: ConduitStatus[],
): HostedStationPhase {
    if (statuses.length === 0) {
        return "none";
    }

    if (statuses.includes("active")) {
        return "active";
    }

    if (statuses.includes("provisioning")) {
        return "provisioning";
    }

    if (statuses.includes("suspended")) {
        return "suspended";
    }

    return "none";
}

export function normalizeHostedEntitlementStatus(
    status: string,
): HostedEntitlementStatus {
    const parsed = HostedEntitlementStatusSchema.safeParse(status);
    if (parsed.success) {
        return parsed.data;
    }

    return "inactive";
}

export function isEntitlementAllowed(status: HostedEntitlementStatus): boolean {
    return (
        status === "active" ||
        status === "grace" ||
        status === "canceled_not_expired"
    );
}

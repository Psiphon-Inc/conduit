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
import { AccountProfile, ConduitsSnapshot } from "@/src/hosted/contracts";
import {
    deriveHostedStationPhaseFromConduits,
    normalizeHostedEntitlementStatus,
} from "@/src/hosted/experience/stateMachine";
import {
    HostedExperienceState,
    HostedRevenueCatPhase,
    HostedStationPhase,
} from "@/src/hosted/experience/types";
import { HostedSession } from "@/src/hosted/sessionClient";

interface HostedExperienceSelectorInput {
    session: HostedSession | null;
    authPending: boolean;
    authError: string | null;
    revenuecatPhase: HostedRevenueCatPhase;
    revenuecatError: string | null;
    accountProfile: AccountProfile | null;
    conduitsSnapshot: ConduitsSnapshot | null;
    conduitsError: string | null;
    conduitsUpdatedAtMs: number;
    lastUpdatedAtMs: Array<number>;
}

export function selectHostedExperienceState(
    input: HostedExperienceSelectorInput,
): HostedExperienceState {
    const pollAfterSeconds =
        input.conduitsSnapshot?.poll_after_seconds ??
        input.conduitsSnapshot?.conduits[0]?.poll_after_seconds ??
        null;
    const stationPhase = resolveStationPhase(
        input.conduitsSnapshot,
        input.conduitsError,
    );
    const lastUpdatedAtMs = input.lastUpdatedAtMs.length
        ? Math.max(...input.lastUpdatedAtMs)
        : null;

    return {
        authPhase: input.session
            ? "authenticated"
            : input.authPending
              ? "authenticating"
              : input.authError
                ? "auth_error"
                : "signed_out",
        session: input.session,
        authError: input.authError,
        revenuecatPhase: input.revenuecatPhase,
        revenuecatError: input.revenuecatError,
        stationPhase,
        stationError: input.conduitsError,
        accountProfile: input.accountProfile,
        conduitsSnapshot: input.conduitsSnapshot,
        entitlementSnapshot: normalizeHostedEntitlementStatus(
            input.conduitsSnapshot?.entitlement.status ?? "inactive",
        ),
        polling: {
            pollAfterSeconds,
            nextPollAt:
                pollAfterSeconds == null || input.conduitsUpdatedAtMs <= 0
                    ? null
                    : input.conduitsUpdatedAtMs + pollAfterSeconds * 1000,
            lastError: input.conduitsError,
        },
        lastUpdatedAtMs,
    };
}

function resolveStationPhase(
    snapshot: ConduitsSnapshot | null,
    errorMessage: string | null,
): HostedStationPhase {
    if (!snapshot) {
        return "none";
    }

    if (errorMessage) {
        return deriveHostedStationPhaseFromConduits(
            snapshot.conduits.map((conduit) => conduit.status),
        );
    }

    return deriveHostedStationPhaseFromConduits(
        snapshot.conduits.map((conduit) => conduit.status),
    );
}

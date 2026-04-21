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
import { ConduitView } from "@/src/hosted/contracts";
import { HostedStationPhase } from "@/src/hosted/experience/types";
import { resolveHostedPersonalPairingState } from "@/src/hosted/personalPairing";
import { HostedEntitlementStatus } from "@/src/hosted/revenuecatEntitlements";

export type HostedCallToActionMode =
    | "loading"
    | "setup"
    | "restore"
    | "preparing"
    | "share";

export interface ResolveHostedCallToActionModeInput {
    initialSessionResolved: boolean;
    hasHostedSession: boolean;
    hasConduitsSnapshot: boolean;
    hostedSnapshotBootstrapPending: boolean;
    entitlementAllowed: boolean;
    entitlementSnapshot: HostedEntitlementStatus;
    stationPhase: HostedStationPhase;
    conduits: ConduitView[];
}

export interface HostedCallToActionResolution {
    hasActiveHostedConduit: boolean;
    hostedSharePreparing: boolean;
    hostedShareReady: boolean;
    needsHostedRestore: boolean;
    isHostedEntitlementResolving: boolean;
    mode: HostedCallToActionMode;
}

export function resolveHostedCallToActionMode(
    input: ResolveHostedCallToActionModeInput,
): HostedCallToActionResolution {
    const shouldBootstrapHostedSnapshot =
        input.initialSessionResolved &&
        input.hasHostedSession &&
        !input.hasConduitsSnapshot;
    const isHostedEntitlementResolving =
        shouldBootstrapHostedSnapshot && input.hostedSnapshotBootstrapPending;

    const hasActiveHostedConduit = input.conduits.some(
        (conduit) => conduit.status === "active",
    );
    const hostedPersonalPairing = resolveHostedPersonalPairingState({
        hasHostedSession: input.hasHostedSession,
        entitlementAllowed: input.entitlementAllowed,
        stationPhase: input.stationPhase,
        conduits: input.conduits,
    });
    const hostedShareReady = hostedPersonalPairing.ready;
    const hostedSharePreparing = hostedPersonalPairing.preparing;

    const hasExistingHostedSetup =
        input.conduits.length > 0 ||
        input.stationPhase === "active" ||
        input.stationPhase === "suspended";
    const needsHostedRestore =
        !input.entitlementAllowed &&
        (input.entitlementSnapshot === "expired" || hasExistingHostedSetup);

    const mode: HostedCallToActionMode = isHostedEntitlementResolving
        ? "loading"
        : hostedShareReady
          ? "share"
          : hostedSharePreparing
            ? "preparing"
            : needsHostedRestore
              ? "restore"
              : "setup";

    return {
        hasActiveHostedConduit,
        hostedSharePreparing,
        hostedShareReady,
        needsHostedRestore,
        isHostedEntitlementResolving,
        mode,
    };
}

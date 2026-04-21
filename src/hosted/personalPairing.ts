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
 */
import { ConduitView } from "@/src/hosted/contracts";
import { HostedStationPhase } from "@/src/hosted/experience/types";

export interface HostedPersonalPairingState {
    hostedPersonalCompartmentId: string | null;
    ready: boolean;
    preparing: boolean;
}

export function resolveHostedPersonalPairingState(input: {
    hasHostedSession: boolean;
    entitlementAllowed: boolean;
    stationPhase: HostedStationPhase;
    conduits: ConduitView[];
}): HostedPersonalPairingState {
    const hostedPersonalCompartmentId = selectHostedPersonalCompartmentId(
        input.conduits,
    );
    const activeShareableConduit =
        input.conduits.find(
            (conduit) =>
                conduit.traffic_scope === "personal" &&
                conduit.status === "active" &&
                conduit.personal_compartment_id,
        ) ??
        input.conduits.find(
            (conduit) =>
                conduit.status === "active" && conduit.personal_compartment_id,
        );

    const ready =
        input.hasHostedSession &&
        input.entitlementAllowed &&
        input.stationPhase === "active" &&
        activeShareableConduit != null;
    const preparing =
        input.hasHostedSession &&
        input.entitlementAllowed &&
        !ready &&
        (input.stationPhase === "none" ||
            input.stationPhase === "provisioning" ||
            input.stationPhase === "active");

    return {
        hostedPersonalCompartmentId,
        ready,
        preparing,
    };
}

export function selectHostedPersonalCompartmentId(
    conduits: ConduitView[],
): string | null {
    const preferred = conduits.find(
        (conduit) => conduit.traffic_scope === "personal",
    );
    return (
        preferred?.personal_compartment_id ??
        conduits.find((conduit) => conduit.personal_compartment_id)
            ?.personal_compartment_id ??
        null
    );
}

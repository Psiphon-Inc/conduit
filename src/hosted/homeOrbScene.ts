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
import { ConduitStatus, HostedHostStatus } from "@/src/hosted/contracts";

export interface OrbHostedTrack {
    id: string;
    connectedCount: number;
    conduitStatus: ConduitStatus;
    hostStatus?: HostedHostStatus;
}

export interface OrbHostedLaneMapping {
    id: string;
    orbIndex: number;
}

export interface OrbHostedProvisioningMarker {
    id: string;
    orbIndex: number;
}

export function shouldShowHostedProvisioningMarker(
    track: Pick<OrbHostedTrack, "conduitStatus" | "hostStatus">,
): boolean {
    return (
        track.conduitStatus === "provisioning" &&
        (track.hostStatus == null ||
            track.hostStatus === "none" ||
            track.hostStatus === "provisioning")
    );
}

export function deriveHostedProvisioningMarkers(
    tracks: OrbHostedTrack[],
    lanes: OrbHostedLaneMapping[],
): OrbHostedProvisioningMarker[] {
    const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
    return tracks.flatMap((track) => {
        if (!shouldShowHostedProvisioningMarker(track)) {
            return [];
        }

        const lane = laneById.get(track.id);
        if (!lane) {
            return [];
        }

        return [{ id: track.id, orbIndex: lane.orbIndex }];
    });
}

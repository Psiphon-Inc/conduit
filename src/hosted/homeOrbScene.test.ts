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
import {
    OrbHostedTrack,
    deriveHostedProvisioningMarkers,
    shouldShowHostedProvisioningMarker,
} from "@/src/hosted/homeOrbScene";

describe("home orb scene hosted provisioning markers", () => {
    it("shows only provisioning hosted tracks whose host is not resolved", () => {
        expect(
            shouldShowHostedProvisioningMarker({
                conduitStatus: "provisioning",
            }),
        ).toBe(true);
        expect(
            shouldShowHostedProvisioningMarker({
                conduitStatus: "provisioning",
                hostStatus: "none",
            }),
        ).toBe(true);
        expect(
            shouldShowHostedProvisioningMarker({
                conduitStatus: "provisioning",
                hostStatus: "provisioning",
            }),
        ).toBe(true);
        expect(
            shouldShowHostedProvisioningMarker({
                conduitStatus: "provisioning",
                hostStatus: "active",
            }),
        ).toBe(false);
        expect(
            shouldShowHostedProvisioningMarker({
                conduitStatus: "provisioning",
                hostStatus: "deleting",
            }),
        ).toBe(false);
        expect(
            shouldShowHostedProvisioningMarker({
                conduitStatus: "provisioning",
                hostStatus: "error",
            }),
        ).toBe(false);
        expect(
            shouldShowHostedProvisioningMarker({
                conduitStatus: "active",
                hostStatus: "provisioning",
            }),
        ).toBe(false);
    });

    it("maps provisioning hosted tracks to hosted-only orb indexes", () => {
        const tracks: OrbHostedTrack[] = [
            {
                id: "hosted-public",
                connectedCount: 0,
                conduitStatus: "provisioning",
                hostStatus: "none",
            },
            {
                id: "hosted-personal",
                connectedCount: 0,
                conduitStatus: "provisioning",
            },
        ];

        expect(
            deriveHostedProvisioningMarkers(tracks, [
                { id: "hosted-public", orbIndex: 0 },
                { id: "hosted-personal", orbIndex: 1 },
            ]),
        ).toEqual([
            { id: "hosted-public", orbIndex: 0 },
            { id: "hosted-personal", orbIndex: 1 },
        ]);
    });

    it("maps provisioning hosted tracks around a local orb without local markers", () => {
        const tracks: OrbHostedTrack[] = [
            {
                id: "hosted-public",
                connectedCount: 0,
                conduitStatus: "provisioning",
                hostStatus: "provisioning",
            },
            {
                id: "hosted-personal",
                connectedCount: 0,
                conduitStatus: "active",
                hostStatus: "provisioning",
            },
        ];

        expect(
            deriveHostedProvisioningMarkers(tracks, [
                { id: "hosted-public", orbIndex: 0 },
                { id: "local", orbIndex: 1 },
                { id: "hosted-personal", orbIndex: 2 },
            ]),
        ).toEqual([{ id: "hosted-public", orbIndex: 0 }]);
    });
});

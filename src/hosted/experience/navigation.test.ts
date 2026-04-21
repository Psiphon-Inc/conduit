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
import { shouldRouteToHostedActiveExperience } from "@/src/hosted/experience/navigation";
import { createInitialHostedExperienceState } from "@/src/hosted/experience/stateMachine";

describe("hosted experience navigation", () => {
    it("routes only when authenticated, active station, and allowed entitlement", () => {
        const baseState = createInitialHostedExperienceState();

        expect(shouldRouteToHostedActiveExperience(baseState)).toBe(false);

        expect(
            shouldRouteToHostedActiveExperience({
                ...baseState,
                authPhase: "authenticated",
                stationPhase: "active",
                entitlementSnapshot: "active",
            }),
        ).toBe(true);

        expect(
            shouldRouteToHostedActiveExperience({
                ...baseState,
                authPhase: "authenticated",
                stationPhase: "active",
                entitlementSnapshot: "grace",
            }),
        ).toBe(true);

        expect(
            shouldRouteToHostedActiveExperience({
                ...baseState,
                authPhase: "authenticated",
                stationPhase: "active",
                entitlementSnapshot: "expired",
            }),
        ).toBe(false);

        expect(
            shouldRouteToHostedActiveExperience({
                ...baseState,
                authPhase: "authenticated",
                stationPhase: "provisioning",
                entitlementSnapshot: "active",
            }),
        ).toBe(false);
    });
});

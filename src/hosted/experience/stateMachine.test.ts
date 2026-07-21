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
    createInitialHostedExperienceState,
    deriveHostedStationPhaseFromConduits,
    isEntitlementAllowed,
    normalizeHostedEntitlementStatus,
} from "@/src/hosted/experience/stateMachine";

describe("hosted experience state machine", () => {
    it("starts in signed out baseline", () => {
        const state = createInitialHostedExperienceState();
        expect(state).toEqual({
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
        });
    });

    it("exposes pure helpers for phase/entitlement policy", () => {
        expect(deriveHostedStationPhaseFromConduits([])).toBe("none");
        expect(
            deriveHostedStationPhaseFromConduits(["suspended", "active"]),
        ).toBe("active");

        expect(normalizeHostedEntitlementStatus("active")).toBe("active");
        expect(normalizeHostedEntitlementStatus("unknown_status")).toBe(
            "inactive",
        );

        expect(isEntitlementAllowed("active")).toBe(true);
        expect(isEntitlementAllowed("grace")).toBe(true);
        expect(isEntitlementAllowed("canceled_not_expired")).toBe(true);
        expect(isEntitlementAllowed("inactive")).toBe(false);
        expect(isEntitlementAllowed("expired")).toBe(false);
    });
});

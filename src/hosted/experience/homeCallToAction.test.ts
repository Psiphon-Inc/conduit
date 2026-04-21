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
import {
    ResolveHostedCallToActionModeInput,
    resolveHostedCallToActionMode,
} from "@/src/hosted/experience/homeCallToAction";

describe("hosted home CTA mode", () => {
    it("uses share mode when entitlement is allowed and an active conduit exists", () => {
        const result = resolveHostedCallToActionMode(
            makeInput({
                entitlementAllowed: true,
                entitlementSnapshot: "active",
                stationPhase: "active",
                conduits: [makeConduit("active", true)],
            }),
        );

        expect(result.hostedShareReady).toBe(true);
        expect(result.mode).toBe("share");
    });

    it("uses preparing mode when entitlement is allowed but hosted pairing is not ready", () => {
        const result = resolveHostedCallToActionMode(
            makeInput({
                entitlementAllowed: true,
                entitlementSnapshot: "active",
                stationPhase: "none",
                conduits: [],
            }),
        );

        expect(result.hostedSharePreparing).toBe(true);
        expect(result.mode).toBe("preparing");
    });

    it("uses restore mode when entitlement is not allowed and setup already exists", () => {
        const result = resolveHostedCallToActionMode(
            makeInput({
                entitlementAllowed: false,
                entitlementSnapshot: "expired",
                stationPhase: "suspended",
                conduits: [makeConduit("suspended")],
            }),
        );

        expect(result.needsHostedRestore).toBe(true);
        expect(result.mode).toBe("restore");
    });

    it("uses setup mode for first-time inactive users", () => {
        const result = resolveHostedCallToActionMode(
            makeInput({
                entitlementAllowed: false,
                entitlementSnapshot: "inactive",
                stationPhase: "none",
                conduits: [],
            }),
        );

        expect(result.needsHostedRestore).toBe(false);
        expect(result.mode).toBe("setup");
    });

    it("uses loading mode while hosted snapshot bootstrap is pending", () => {
        const result = resolveHostedCallToActionMode(
            makeInput({
                hasConduitsSnapshot: false,
                hostedSnapshotBootstrapPending: true,
            }),
        );

        expect(result.isHostedEntitlementResolving).toBe(true);
        expect(result.mode).toBe("loading");
    });

    it("does not stay in loading mode when bootstrap is not pending", () => {
        const result = resolveHostedCallToActionMode(
            makeInput({
                hasConduitsSnapshot: false,
                hostedSnapshotBootstrapPending: false,
            }),
        );

        expect(result.isHostedEntitlementResolving).toBe(false);
        expect(result.mode).toBe("share");
    });

    it("uses preparing mode when the hosted conduit is active without a personal pairing ID", () => {
        const result = resolveHostedCallToActionMode(
            makeInput({
                stationPhase: "active",
                conduits: [makeConduit("active")],
            }),
        );

        expect(result.hostedShareReady).toBe(false);
        expect(result.hostedSharePreparing).toBe(true);
        expect(result.mode).toBe("preparing");
    });
});

function makeInput(
    overrides: Partial<ResolveHostedCallToActionModeInput>,
): ResolveHostedCallToActionModeInput {
    return {
        initialSessionResolved: true,
        hasHostedSession: true,
        hasConduitsSnapshot: true,
        hostedSnapshotBootstrapPending: false,
        entitlementAllowed: true,
        entitlementSnapshot: "active",
        stationPhase: "active",
        conduits: [makeConduit("active", true)],
        ...overrides,
    };
}

function makeConduit(
    status: ConduitView["status"],
    withPersonalCompartmentId = false,
): ConduitView {
    return {
        conduit_id: "c-1",
        proxy_id: "s-1",
        status,
        traffic_scope: "personal",
        personal_compartment_id: withPersonalCompartmentId
            ? "N8nN1DTLcuNj3DG39uUyIqBP+xKujq6IAklKO1f1Ftk"
            : undefined,
    };
}

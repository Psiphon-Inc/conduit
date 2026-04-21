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
    applyConduitsSnapshot,
    createInitialHostedExperienceState,
    deriveHostedStationPhaseFromConduits,
    isEntitlementAllowed,
    isHostedRefreshTokenExpired,
    normalizeHostedEntitlementStatus,
    reduceHostedExperienceState,
    shouldRefreshHostedSession,
    toHostedStationPhase,
} from "@/src/hosted/experience/stateMachine";
import { HostedSession } from "@/src/hosted/sessionClient";

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

    it("transitions auth and session deterministically", () => {
        const session = makeSession({
            accessTokenExpiresAtMs: 50_000,
            refreshTokenExpiresAtMs: 120_000,
        });

        const authStarting = reduceHostedExperienceState(
            createInitialHostedExperienceState(),
            {
                type: "auth/start",
                occurredAtMs: 10_000,
            },
        );
        expect(authStarting.authPhase).toBe("authenticating");

        const authenticated = reduceHostedExperienceState(authStarting, {
            type: "auth/success",
            session,
            occurredAtMs: 10_100,
        });
        expect(authenticated.authPhase).toBe("authenticated");
        expect(authenticated.session?.accountId).toBe(session.accountId);

        const refreshed = reduceHostedExperienceState(authenticated, {
            type: "session/refreshed",
            session: {
                ...session,
                accessToken: "access.new",
            },
            occurredAtMs: 11_000,
        });
        expect(refreshed.session?.accessToken).toBe("access.new");

        const signedOut = reduceHostedExperienceState(refreshed, {
            type: "session/cleared",
            occurredAtMs: 12_000,
        });
        expect(signedOut.authPhase).toBe("signed_out");
        expect(signedOut.session).toBeNull();
    });

    it("clears stale hosted state when a new auth attempt starts", () => {
        const withActiveState = reduceHostedExperienceState(
            createInitialHostedExperienceState(),
            {
                type: "conduits/update",
                snapshot: {
                    entitlement: { status: "active" },
                    conduits: [
                        {
                            conduit_id: "cond_123",
                            proxy_id: "st_123",
                            status: "active",
                        },
                    ],
                    poll_after_seconds: 10,
                },
                receivedAtMs: 10_000,
            },
        );

        const authStarting = reduceHostedExperienceState(withActiveState, {
            type: "auth/start",
            occurredAtMs: 11_000,
        });

        expect(authStarting.authPhase).toBe("authenticating");
        expect(authStarting.session).toBeNull();
        expect(authStarting.entitlementSnapshot).toBe("inactive");
        expect(authStarting.conduitsSnapshot).toBeNull();
        expect(authStarting.stationPhase).toBe("none");
        expect(authStarting.polling.nextPollAt).toBeNull();
    });

    it("maps station and polling snapshots", () => {
        const withSession = reduceHostedExperienceState(
            createInitialHostedExperienceState(),
            {
                type: "session/loaded",
                session: makeSession({
                    accessTokenExpiresAtMs: 70_000,
                    refreshTokenExpiresAtMs: 160_000,
                }),
                occurredAtMs: 20_000,
            },
        );

        const stationUpdated = applyConduitsSnapshot(
            withSession,
            {
                entitlement: {
                    status: "active",
                    product_id: "test.product.primary",
                },
                conduits: [
                    {
                        conduit_id: "cond_123",
                        proxy_id: "st_123",
                        status: "provisioning",
                    },
                ],
                poll_after_seconds: 30,
            },
            25_000,
        );

        expect(stationUpdated.stationPhase).toBe("provisioning");
        expect(stationUpdated.entitlementSnapshot).toBe("active");
        expect(stationUpdated.polling.pollAfterSeconds).toBe(30);
        expect(stationUpdated.polling.nextPollAt).toBe(55_000);
    });

    it("handles conduits and revenuecat errors", () => {
        const errored = reduceHostedExperienceState(
            createInitialHostedExperienceState(),
            {
                type: "conduits/error",
                errorMessage: "network unavailable",
                occurredAtMs: 30_000,
            },
        );

        expect(errored.stationPhase).toBe("error");
        expect(errored.polling.lastError).toBe("network unavailable");

        const revenueCatErrored = reduceHostedExperienceState(errored, {
            type: "revenuecat/error",
            errorMessage: "store unavailable",
            occurredAtMs: 30_100,
        });
        expect(revenueCatErrored.revenuecatPhase).toBe("error");
        expect(revenueCatErrored.revenuecatError).toBe("store unavailable");
    });

    it("exposes pure helpers for phase/entitlement policy", () => {
        expect(toHostedStationPhase("none")).toBe("none");
        expect(toHostedStationPhase("provisioning")).toBe("provisioning");
        expect(toHostedStationPhase("active")).toBe("active");
        expect(toHostedStationPhase("suspended")).toBe("suspended");
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

    it("refresh helper thresholds are deterministic", () => {
        const session = makeSession({
            accessTokenExpiresAtMs: 100_000,
            refreshTokenExpiresAtMs: 200_000,
        });

        expect(shouldRefreshHostedSession(session, 84_900)).toBe(false);
        expect(shouldRefreshHostedSession(session, 85_000)).toBe(true);
        expect(isHostedRefreshTokenExpired(session, 184_900)).toBe(false);
        expect(isHostedRefreshTokenExpired(session, 185_000)).toBe(true);
    });
});

function makeSession(input: {
    accessTokenExpiresAtMs: number;
    refreshTokenExpiresAtMs: number;
}): HostedSession {
    return {
        accountId: "acc_6f3e6b6e-392e-41a2-bbbf-7f0f7f3f8a61",
        accessToken: "access.token",
        accessTokenExpiresAtMs: input.accessTokenExpiresAtMs,
        refreshToken: "refresh.token",
        refreshTokenExpiresAtMs: input.refreshTokenExpiresAtMs,
        personalPairingWrapperBaseUrl: null,
        accountProfile: null,
    };
}

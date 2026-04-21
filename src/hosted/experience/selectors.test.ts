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
import { selectHostedExperienceState } from "@/src/hosted/experience/selectors";
import { HostedSession } from "@/src/hosted/sessionClient";

describe("hosted experience selectors", () => {
    it("keeps station phase at none before the first snapshot arrives", () => {
        const state = selectHostedExperienceState({
            session: makeSession(),
            authPending: false,
            authError: null,
            revenuecatPhase: "ready",
            revenuecatError: null,
            accountProfile: null,
            conduitsSnapshot: null,
            conduitsError: "Network request failed",
            conduitsUpdatedAtMs: 0,
            lastUpdatedAtMs: [],
        });

        expect(state.stationPhase).toBe("none");
        expect(state.stationError).toBe("Network request failed");
    });

    it("preserves the last snapshot-derived station phase when refreshes fail", () => {
        const state = selectHostedExperienceState({
            session: makeSession(),
            authPending: false,
            authError: null,
            revenuecatPhase: "ready",
            revenuecatError: null,
            accountProfile: null,
            conduitsSnapshot: {
                entitlement: { status: "active" },
                conduits: [
                    {
                        conduit_id: "cond_123",
                        proxy_id: "proxy_123",
                        status: "active",
                    },
                ],
            },
            conduitsError: "Network request failed",
            conduitsUpdatedAtMs: 1_000,
            lastUpdatedAtMs: [1_000],
        });

        expect(state.stationPhase).toBe("active");
        expect(state.stationError).toBe("Network request failed");
    });
});

function makeSession(): HostedSession {
    return {
        accountId: "acc_123",
        accessToken: "access_token",
        accessTokenExpiresAtMs: 1_000,
        refreshToken: "refresh_token",
        refreshTokenExpiresAtMs: 2_000,
        personalPairingWrapperBaseUrl: null,
        accountProfile: null,
    };
}

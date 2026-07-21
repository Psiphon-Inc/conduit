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
import { HostedSession } from "@/src/hosted/sessionClient";
import {
    isHostedRefreshTokenExpired,
    shouldRefreshHostedSession,
} from "@/src/hosted/sessionState";

describe("hosted session state", () => {
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

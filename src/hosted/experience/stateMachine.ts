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
    ConduitStatus,
    ConduitStatusSchema,
    ConduitsSnapshot,
} from "@/src/hosted/contracts";
import {
    HostedExperienceEvent,
    HostedExperienceState,
    HostedStationPhase,
} from "@/src/hosted/experience/types";
import {
    HostedEntitlementStatus,
    HostedEntitlementStatusSchema,
} from "@/src/hosted/revenuecatEntitlements";
import { HostedSession } from "@/src/hosted/sessionClient";

const EXPIRY_SKEW_MS = 15_000;

export function createInitialHostedExperienceState(): HostedExperienceState {
    return {
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
    };
}

export function reduceHostedExperienceState(
    state: HostedExperienceState,
    event: HostedExperienceEvent,
): HostedExperienceState {
    switch (event.type) {
        case "auth/start":
            return {
                ...state,
                authPhase: "authenticating",
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
                lastUpdatedAtMs: event.occurredAtMs,
            };
        case "auth/success":
        case "session/loaded":
            return {
                ...state,
                authPhase: "authenticated",
                session: event.session,
                authError: null,
                revenuecatPhase: "uninitialized",
                revenuecatError: null,
                stationPhase: "none",
                stationError: null,
                accountProfile: event.session.accountProfile,
                conduitsSnapshot: null,
                entitlementSnapshot: "inactive",
                polling: {
                    nextPollAt: null,
                    pollAfterSeconds: null,
                    lastError: null,
                },
                lastUpdatedAtMs: event.occurredAtMs,
            };
        case "session/refreshed":
            return {
                ...state,
                authPhase: "authenticated",
                session: event.session,
                authError: null,
                accountProfile: event.session.accountProfile,
                lastUpdatedAtMs: event.occurredAtMs,
            };
        case "auth/error":
            return {
                ...state,
                authPhase: "auth_error",
                session: null,
                authError: event.errorMessage,
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
                lastUpdatedAtMs: event.occurredAtMs,
            };
        case "session/cleared":
            return {
                ...createInitialHostedExperienceState(),
                lastUpdatedAtMs: event.occurredAtMs,
            };
        case "revenuecat/purchase_pending":
            return {
                ...state,
                revenuecatPhase: "purchase_pending",
                revenuecatError: null,
                lastUpdatedAtMs: event.occurredAtMs,
            };
        case "revenuecat/restore_pending":
            return {
                ...state,
                revenuecatPhase: "restore_pending",
                revenuecatError: null,
                lastUpdatedAtMs: event.occurredAtMs,
            };
        case "revenuecat/ready":
            return {
                ...state,
                revenuecatPhase: "ready",
                revenuecatError: null,
                lastUpdatedAtMs: event.occurredAtMs,
            };
        case "revenuecat/error":
            return {
                ...state,
                revenuecatPhase: "error",
                revenuecatError: event.errorMessage,
                lastUpdatedAtMs: event.occurredAtMs,
            };
        case "revenuecat/warning":
            return {
                ...state,
                revenuecatError: event.errorMessage,
                lastUpdatedAtMs: event.occurredAtMs,
            };
        case "entitlement/update":
            return {
                ...state,
                entitlementSnapshot: event.entitlementStatus,
                lastUpdatedAtMs: event.occurredAtMs,
            };
        case "account/profile_updated":
            return {
                ...state,
                accountProfile: event.profile,
                session: state.session
                    ? {
                          ...state.session,
                          accountProfile: event.profile,
                      }
                    : null,
                lastUpdatedAtMs: event.occurredAtMs,
            };
        case "conduits/update": {
            const pollAfterSeconds =
                event.snapshot.poll_after_seconds ??
                event.snapshot.conduits[0]?.poll_after_seconds ??
                null;
            const stationEntitlementStatus = normalizeHostedEntitlementStatus(
                event.snapshot.entitlement.status,
            );
            const nextStationPhase = deriveHostedStationPhaseFromConduits(
                event.snapshot.conduits.map((conduit) => conduit.status),
            );
            const entitlementStatus = stationEntitlementStatus;
            return {
                ...state,
                stationPhase: nextStationPhase,
                stationError: null,
                accountProfile: event.snapshot.account ?? state.accountProfile,
                conduitsSnapshot: event.snapshot,
                entitlementSnapshot: entitlementStatus,
                polling: {
                    nextPollAt: computeNextPollAt(
                        event.receivedAtMs,
                        pollAfterSeconds,
                    ),
                    pollAfterSeconds,
                    lastError: null,
                },
                lastUpdatedAtMs: event.receivedAtMs,
            };
        }
        case "conduits/error":
            return {
                ...state,
                stationPhase: "error",
                stationError: event.errorMessage,
                polling: {
                    ...state.polling,
                    lastError: event.errorMessage,
                    nextPollAt: null,
                },
                lastUpdatedAtMs: event.occurredAtMs,
            };
        default:
            return state;
    }
}

export function toHostedStationPhase(
    status: ConduitStatus,
): HostedStationPhase {
    switch (status) {
        case "none":
            return "none";
        case "provisioning":
            return "provisioning";
        case "active":
            return "active";
        case "suspended":
            return "suspended";
        default:
            ConduitStatusSchema.parse(status);
            return "error";
    }
}

export function deriveHostedStationPhaseFromConduits(
    statuses: ConduitStatus[],
): HostedStationPhase {
    if (statuses.length === 0) {
        return "none";
    }

    if (statuses.includes("active")) {
        return "active";
    }

    if (statuses.includes("provisioning")) {
        return "provisioning";
    }

    if (statuses.includes("suspended")) {
        return "suspended";
    }

    return "none";
}

export function normalizeHostedEntitlementStatus(
    status: string,
): HostedEntitlementStatus {
    const parsed = HostedEntitlementStatusSchema.safeParse(status);
    if (parsed.success) {
        return parsed.data;
    }

    return "inactive";
}

export function isEntitlementAllowed(status: HostedEntitlementStatus): boolean {
    return (
        status === "active" ||
        status === "grace" ||
        status === "canceled_not_expired"
    );
}

export function shouldRefreshHostedSession(
    session: HostedSession,
    nowMs: number,
): boolean {
    return session.accessTokenExpiresAtMs - EXPIRY_SKEW_MS <= nowMs;
}

export function isHostedRefreshTokenExpired(
    session: HostedSession,
    nowMs: number,
): boolean {
    return session.refreshTokenExpiresAtMs - EXPIRY_SKEW_MS <= nowMs;
}

export function applyConduitsSnapshot(
    state: HostedExperienceState,
    snapshot: ConduitsSnapshot,
    receivedAtMs: number,
): HostedExperienceState {
    return reduceHostedExperienceState(state, {
        type: "conduits/update",
        snapshot,
        receivedAtMs,
    });
}

function computeNextPollAt(
    receivedAtMs: number,
    pollAfterSeconds: number | null,
): number | null {
    if (pollAfterSeconds == null) {
        return null;
    }

    return receivedAtMs + pollAfterSeconds * 1000;
}

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
import type { ConduitView } from "@/src/hosted/contracts";
import type { DashboardSummaryAggregate } from "@/src/hosted/dashboard";

/**
 * Returns a numeric rank for a conduit traffic scope, used for display
 * sorting: personal (0) > public (1) > other (2).
 */
export function conduitScopeRank(scope: ConduitView["traffic_scope"]): number {
    if (scope === "personal") {
        return 0;
    }
    if (scope === "public") {
        return 1;
    }
    return 2;
}

/**
 * Sorts conduits by traffic scope priority for display.
 */
export function orderedConduitsForDisplay(
    conduits: ConduitView[],
): ConduitView[] {
    return [...conduits].sort((left, right) => {
        return (
            conduitScopeRank(left.traffic_scope) -
            conduitScopeRank(right.traffic_scope)
        );
    });
}

/**
 * Formats a conduit traffic scope to a human-readable label.
 */
export function formatConduitScope(
    scope: ConduitView["traffic_scope"],
): string {
    if (scope === "personal") {
        return "Personal conduit";
    }
    if (scope === "public") {
        return "Public conduit";
    }
    return "Hosted conduit";
}

/**
 * Maps a conduit traffic scope to the appropriate icon asset.
 */
export function getScopeIcon(
    scope: ConduitView["traffic_scope"],
): number | null {
    if (scope === "public") {
        return require("@/assets/images/icons/globe.svg");
    }
    if (scope === "personal") {
        return require("@/assets/images/icons/p2p_24px.svg");
    }
    return null;
}

/**
 * Maps a conduit traffic scope to a short display label.
 */
export function getScopeLabel(
    scope: ConduitView["traffic_scope"],
): string | null {
    if (scope === "personal") {
        return "Personal";
    }
    if (scope === "public") {
        return "Public";
    }
    return null;
}

/**
 * Resolves the connected user count for a conduit from summary aggregate
 * data based on its scope.
 */
export function resolveConnectedCount(
    conduit: ConduitView,
    currentCounts: DashboardSummaryAggregate | null,
): number {
    if (!currentCounts) {
        return 0;
    }
    if (conduit.traffic_scope === "personal") {
        return Math.round(currentCounts.personal.connectedUsers);
    }
    if (conduit.traffic_scope === "public") {
        return Math.round(currentCounts.public.connectedUsers);
    }
    return Math.round(currentCounts.total.connectedUsers);
}

/**
 * Resolves the connected user count for a hosted conduit by scope,
 * given separate personal and public counts.
 */
export function resolveHostedConduitConnectedCount(
    trafficScope: "personal" | "public" | undefined,
    personalConnected: number,
    publicConnected: number,
): number {
    if (trafficScope === "personal") {
        return Math.max(0, Math.round(personalConnected));
    }
    if (trafficScope === "public") {
        return Math.max(0, Math.round(publicConnected));
    }
    return Math.max(0, Math.round(personalConnected + publicConnected));
}

/**
 * Resolves the bytes count for a hosted conduit by scope,
 * given separate personal and public byte counts.
 */
export function resolveHostedConduitBytes(
    trafficScope: "personal" | "public" | undefined,
    personalBytes: number,
    publicBytes: number,
): number {
    if (trafficScope === "personal") {
        return Math.max(0, personalBytes);
    }
    if (trafficScope === "public") {
        return Math.max(0, publicBytes);
    }
    return Math.max(0, personalBytes + publicBytes);
}

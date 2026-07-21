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
import { AccountProfile, ConduitsSnapshot } from "@/src/hosted/contracts";
import { HostedEntitlementStatus } from "@/src/hosted/revenuecatEntitlements";
import { HostedSession } from "@/src/hosted/sessionClient";

type HostedAuthPhase =
    | "signed_out"
    | "authenticating"
    | "authenticated"
    | "auth_error";

export type HostedRevenueCatPhase =
    | "uninitialized"
    | "ready"
    | "purchase_pending"
    | "restore_pending"
    | "error";

export type HostedStationPhase =
    | "none"
    | "provisioning"
    | "active"
    | "suspended"
    | "error";

interface HostedPollingMetadata {
    nextPollAt: number | null;
    pollAfterSeconds: number | null;
    lastError: string | null;
}

export interface HostedExperienceState {
    authPhase: HostedAuthPhase;
    session: HostedSession | null;
    authError: string | null;
    revenuecatPhase: HostedRevenueCatPhase;
    revenuecatError: string | null;
    stationPhase: HostedStationPhase;
    stationError: string | null;
    accountProfile: AccountProfile | null;
    conduitsSnapshot: ConduitsSnapshot | null;
    entitlementSnapshot: HostedEntitlementStatus;
    polling: HostedPollingMetadata;
    lastUpdatedAtMs: number | null;
}

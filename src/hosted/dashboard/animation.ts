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
import type { DashboardSummaryAggregate } from "@/src/hosted/dashboard";

export interface SummaryAggregateVector {
    personalConnected: number;
    personalConnecting: number;
    personalBytes: number;
    publicConnected: number;
    publicConnecting: number;
    publicBytes: number;
    totalConnected: number;
    totalConnecting: number;
    totalBytes: number;
}

/**
 * Linearly interpolates between two summary aggregate vectors.
 */
export function interpolateSummaryVector(
    from: SummaryAggregateVector,
    to: SummaryAggregateVector,
    progress: number,
): SummaryAggregateVector {
    "worklet";
    const lerp = (start: number, end: number): number => {
        return start + (end - start) * progress;
    };

    return {
        personalConnected: lerp(from.personalConnected, to.personalConnected),
        personalConnecting: lerp(
            from.personalConnecting,
            to.personalConnecting,
        ),
        personalBytes: lerp(from.personalBytes, to.personalBytes),
        publicConnected: lerp(from.publicConnected, to.publicConnected),
        publicConnecting: lerp(from.publicConnecting, to.publicConnecting),
        publicBytes: lerp(from.publicBytes, to.publicBytes),
        totalConnected: lerp(from.totalConnected, to.totalConnected),
        totalConnecting: lerp(from.totalConnecting, to.totalConnecting),
        totalBytes: lerp(from.totalBytes, to.totalBytes),
    };
}

/**
 * Converts a DashboardSummaryAggregate to a flat numeric vector for animation.
 */
export function summaryAggregateToVector(
    summary: DashboardSummaryAggregate | null,
): SummaryAggregateVector {
    if (!summary) {
        return {
            personalConnected: 0,
            personalConnecting: 0,
            personalBytes: 0,
            publicConnected: 0,
            publicConnecting: 0,
            publicBytes: 0,
            totalConnected: 0,
            totalConnecting: 0,
            totalBytes: 0,
        };
    }

    return {
        personalConnected: summary.personal.connectedUsers,
        personalConnecting: summary.personal.connectingUsers,
        personalBytes: summary.personal.bytesTransferred,
        publicConnected: summary.public.connectedUsers,
        publicConnecting: summary.public.connectingUsers,
        publicBytes: summary.public.bytesTransferred,
        totalConnected: summary.total.connectedUsers,
        totalConnecting: summary.total.connectingUsers,
        totalBytes: summary.total.bytesTransferred,
    };
}

/**
 * Converts a flat numeric vector back to a DashboardSummaryAggregate.
 */
export function summaryVectorToAggregate(
    value: SummaryAggregateVector,
): DashboardSummaryAggregate {
    "worklet";
    return {
        personal: {
            connectedUsers: value.personalConnected,
            connectingUsers: value.personalConnecting,
            bytesTransferred: value.personalBytes,
        },
        public: {
            connectedUsers: value.publicConnected,
            connectingUsers: value.publicConnecting,
            bytesTransferred: value.publicBytes,
        },
        total: {
            connectedUsers: value.totalConnected,
            connectingUsers: value.totalConnecting,
            bytesTransferred: value.totalBytes,
        },
    };
}

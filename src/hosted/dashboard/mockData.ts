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
import type { RecentWindow, SummaryWindow } from "@/src/hosted/contracts";
import type {
    DashboardLiveData,
    DashboardRecentData,
    DashboardSummaryData,
} from "@/src/hosted/dashboard";

export function buildMockDashboardSummaryData(
    window: SummaryWindow,
): DashboardSummaryData {
    const tick = Math.floor(Date.now() / 5000);
    const personalActive = 2 + (tick % 4);
    const publicActive = 9 + ((tick * 2) % 6);
    const personalConnecting = 1 + ((tick + 1) % 3);
    const publicConnecting = tick % 4;

    return {
        window,
        generatedAt: new Date().toISOString(),
        stationId: "dev-mock-station",
        cards: [
            {
                segment: "personal",
                activeUsers: personalActive,
                connectingUsers: personalConnecting,
                bytesUp: 90_000_000 + tick * 5_000_000,
                bytesDown: 210_000_000 + tick * 9_000_000,
            },
            {
                segment: "public",
                activeUsers: publicActive,
                connectingUsers: publicConnecting,
                bytesUp: 510_000_000 + tick * 17_000_000,
                bytesDown: 1_020_000_000 + tick * 24_000_000,
            },
        ],
    };
}

export function buildMockDashboardRecentData(
    window: RecentWindow,
): DashboardRecentData {
    const generatedAtMs = Date.now();
    const bucketSeconds =
        window === "5m"
            ? 30
            : window === "48h"
              ? 3600
              : window === "7d"
                ? 6 * 3600
                : 24 * 3600;
    const bucketMs = bucketSeconds * 1000;
    const alignedNowMs = Math.floor(generatedAtMs / bucketMs) * bucketMs;
    const tick = Math.floor(Date.now() / 5000);
    const points =
        window === "5m"
            ? 10
            : window === "48h"
              ? 48
              : window === "7d"
                ? 28
                : 30;

    const series = Array.from({ length: points }, (_, index) => {
        const tsMs = alignedNowMs - (points - 1 - index) * bucketMs;
        const phase = tick + index;
        const personalActiveUsers = 2 + (phase % 4);
        const publicActiveUsers = 8 + ((phase * 2) % 7);
        const personalConnectingUsers = phase % 3;
        const publicConnectingUsers = (phase + index) % 4;
        const personalBytesTransferred =
            1_200_000 + personalActiveUsers * 330_000 + index * 16_000;
        const publicBytesTransferred =
            4_500_000 + publicActiveUsers * 520_000 + index * 28_000;
        const bytesUp = personalBytesTransferred + publicBytesTransferred;
        const bytesDown = Math.round(bytesUp * 1.7);

        return {
            ts: new Date(tsMs).toISOString(),
            personalActiveUsers,
            publicActiveUsers,
            personalConnectingUsers,
            publicConnectingUsers,
            personalBytesTransferred,
            publicBytesTransferred,
            bytesUp,
            bytesDown,
        };
    });

    return {
        window,
        bucketSeconds,
        generatedAt: new Date(generatedAtMs).toISOString(),
        stationId: "dev-mock-station",
        series,
    };
}

export function buildMockDashboardLiveData(): DashboardLiveData {
    const tick = Math.floor(Date.now() / 5000);
    const personalConnected = 2 + (tick % 5);
    const publicConnected = 9 + ((tick * 2) % 6);
    const personalConnecting = tick % 3;
    const publicConnecting = (tick + 1) % 4;
    const personalBytesUpTotal = 210_000_000 + tick * 6_000_000;
    const personalBytesDownTotal = 530_000_000 + tick * 10_000_000;
    const publicBytesUpTotal = 930_000_000 + tick * 20_000_000;
    const publicBytesDownTotal = 1_820_000_000 + tick * 29_000_000;

    return {
        generatedAt: new Date().toISOString(),
        stationId: "dev-mock-station",
        announcing: 1,
        segments: {
            personal: {
                connectedUsers: personalConnected,
                connectingUsers: personalConnecting,
                bytesUpTotal: personalBytesUpTotal,
                bytesDownTotal: personalBytesDownTotal,
            },
            public: {
                connectedUsers: publicConnected,
                connectingUsers: publicConnecting,
                bytesUpTotal: publicBytesUpTotal,
                bytesDownTotal: publicBytesDownTotal,
            },
            total: {
                connectedUsers: personalConnected + publicConnected,
                connectingUsers: personalConnecting + publicConnecting,
                bytesUpTotal: personalBytesUpTotal + publicBytesUpTotal,
                bytesDownTotal: personalBytesDownTotal + publicBytesDownTotal,
            },
        },
        personalRegionActivity: [
            {
                region: "US",
                connectedUsers: Math.max(1, personalConnected - 1),
                connectingUsers: personalConnecting,
                bytesUpTotal: Math.round(personalBytesUpTotal * 0.65),
                bytesDownTotal: Math.round(personalBytesDownTotal * 0.6),
            },
            {
                region: "CA",
                connectedUsers: 1,
                connectingUsers: Math.max(0, personalConnecting - 1),
                bytesUpTotal: Math.round(personalBytesUpTotal * 0.35),
                bytesDownTotal: Math.round(personalBytesDownTotal * 0.4),
            },
        ],
        publicRegionActivity: [
            {
                region: "BR",
                connectedUsers: publicConnected,
                connectingUsers: publicConnecting,
                bytesUpTotal: publicBytesUpTotal,
                bytesDownTotal: publicBytesDownTotal,
            },
        ],
    };
}

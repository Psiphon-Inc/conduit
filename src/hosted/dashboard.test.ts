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
    aggregateDashboardRecents,
    aggregateDashboardSummaries,
    normalizeDevLocalProxyIds,
    normalizeStatsLive,
    normalizeStatsRecent,
    normalizeStatsSummary,
    selectStatsTarget,
    toBytesDownTimeseries,
    toBytesUpTimeseries,
    toDashboardLiveData,
    toDashboardRecentData,
    toDashboardSummaryAggregateFromLive,
    toDashboardSummaryData,
    toPersonalActiveUsersTimeseries,
    toPersonalBytesTransferredTimeseries,
    toPublicActiveUsersTimeseries,
    toPublicBytesTransferredTimeseries,
    toTotalTrafficTimeseries,
} from "@/src/hosted/dashboard";

describe("hosted dashboard adapters", () => {
    it("adapts summary response windows", () => {
        const summary = toDashboardSummaryData({
            window: "24h",
            generated_at: "2026-02-06T20:00:00Z",
            proxy_id: "j76IhlV2wG0gH9BIcgAgKpbvDf8JKVh71IUDGOr2y2A",
            segments: {
                personal: {
                    active_users: 14,
                    connecting_users: 4,
                    bytes_up: 182734911,
                    bytes_down: 944823612,
                },
                public: {
                    active_users: 98,
                    connecting_users: 12,
                    bytes_up: 1192837402,
                    bytes_down: 5538201118,
                },
            },
            personal_region_activity: [
                {
                    region: "US",
                    connected_users: 7,
                    connecting_users: 1,
                    bytes_up_total: 400,
                    bytes_down_total: 900,
                },
            ],
            public_region_activity: [],
        });

        expect(summary.window).toBe("24h");
        expect(summary.cards).toHaveLength(2);
        expect(summary.cards[0].segment).toBe("personal");
        expect(summary.cards[1].segment).toBe("public");
        expect(summary.cards[0].connectingUsers).toBe(4);
        expect(summary.personalRegionActivity ?? []).toHaveLength(1);
        expect(summary.personalRegionActivity?.[0]?.region).toBe("US");
    });

    it("adapts recent response windows", () => {
        const recent = toDashboardRecentData({
            window: "5m",
            bucket_seconds: 30,
            generated_at: "2026-02-06T20:00:00Z",
            proxy_id: "j76IhlV2wG0gH9BIcgAgKpbvDf8JKVh71IUDGOr2y2A",
            series: [
                {
                    ts: "2026-02-06T19:59:30Z",
                    personal_active_users: 1,
                    public_active_users: 9,
                    personal_connecting_users: 3,
                    public_connecting_users: 7,
                    personal_bytes_transferred: 12345,
                    public_bytes_transferred: 54321,
                    bytes_up: 462918,
                    bytes_down: 2369720,
                },
                {
                    ts: "2026-02-06T20:00:00Z",
                    personal_active_users: 2,
                    public_active_users: 11,
                    personal_connecting_users: 4,
                    public_connecting_users: 8,
                    personal_bytes_transferred: 33333,
                    public_bytes_transferred: 77777,
                    bytes_up: 571000,
                    bytes_down: 2584400,
                },
            ],
            personal_region_activity: [
                {
                    region: "US",
                    connected_users: 2,
                    connecting_users: 1,
                    bytes_up_total: 20,
                    bytes_down_total: 40,
                },
            ],
            public_region_activity: [
                {
                    region: "IR",
                    connected_users: 9,
                    connecting_users: 3,
                    bytes_up_total: 80,
                    bytes_down_total: 160,
                },
            ],
        });

        expect(recent.window).toBe("5m");
        expect(recent.bucketSeconds).toBe(30);
        expect(recent.series).toHaveLength(10);
        expect(recent.series[0].isPadded).toBe(true);
        const latest = recent.series[recent.series.length - 1];
        expect(latest.publicActiveUsers).toBe(11);
        expect(latest.publicConnectingUsers).toBe(8);
        expect(latest.personalBytesTransferred).toBe(33333);
        expect(latest.isPadded).toBeFalsy();
        expect(recent.personalRegionActivity?.[0]?.region).toBe("US");
        expect(recent.publicRegionActivity?.[0]?.region).toBe("IR");
    });

    it("builds plot series from recent data", () => {
        const recent = toDashboardRecentData({
            window: "5m",
            bucket_seconds: 30,
            generated_at: "2026-02-06T20:00:00Z",
            proxy_id: "j76IhlV2wG0gH9BIcgAgKpbvDf8JKVh71IUDGOr2y2A",
            series: [
                {
                    ts: "2026-02-06T20:00:00Z",
                    personal_active_users: 2,
                    public_active_users: 11,
                    personal_connecting_users: 4,
                    public_connecting_users: 8,
                    personal_bytes_transferred: 70,
                    public_bytes_transferred: 80,
                    bytes_up: 571000,
                    bytes_down: 2584400,
                },
                {
                    ts: "2026-02-06T19:59:30Z",
                    personal_active_users: 1,
                    public_active_users: 9,
                    personal_connecting_users: 3,
                    public_connecting_users: 7,
                    personal_bytes_transferred: 50,
                    public_bytes_transferred: 60,
                    bytes_up: 462918,
                    bytes_down: 2369720,
                },
            ],
        });

        const personalSeries = toPersonalActiveUsersTimeseries(recent);
        const publicSeries = toPublicActiveUsersTimeseries(recent);
        const bytesUpSeries = toBytesUpTimeseries(recent);
        const bytesDownSeries = toBytesDownTimeseries(recent);
        const personalBytesSeries =
            toPersonalBytesTransferredTimeseries(recent);
        const publicBytesSeries = toPublicBytesTransferredTimeseries(recent);
        const totalTrafficSeries = toTotalTrafficTimeseries(recent);

        const measuredPersonalSeries = personalSeries.filter(
            (point) => !point.isPadded,
        );
        const measuredPublicSeries = publicSeries.filter(
            (point) => !point.isPadded,
        );
        const measuredBytesUpSeries = bytesUpSeries.filter(
            (point) => !point.isPadded,
        );
        const measuredBytesDownSeries = bytesDownSeries.filter(
            (point) => !point.isPadded,
        );
        const measuredPersonalBytesSeries = personalBytesSeries.filter(
            (point) => !point.isPadded,
        );
        const measuredPublicBytesSeries = publicBytesSeries.filter(
            (point) => !point.isPadded,
        );
        const measuredTotalTrafficSeries = totalTrafficSeries.filter(
            (point) => !point.isPadded,
        );

        expect(personalSeries).toHaveLength(10);
        expect(personalSeries[0].isPadded).toBe(true);
        expect(measuredPersonalSeries).toHaveLength(2);
        expect(measuredPersonalSeries[0].value).toBe(1);
        expect(measuredPersonalSeries[1].value).toBe(2);
        expect(measuredPublicSeries[1].value).toBe(11);
        expect(measuredBytesUpSeries[0].value).toBe(462918);
        expect(measuredBytesDownSeries[1].value).toBe(2584400);
        expect(measuredPersonalBytesSeries[0].value).toBe(50);
        expect(measuredPublicBytesSeries[1].value).toBe(80);
        expect(measuredTotalTrafficSeries[0].value).toBe(2832638);
        expect(measuredTotalTrafficSeries[1].value).toBe(3155400);
        expect(measuredPersonalSeries[0].time.toISOString()).toBe(
            "2026-02-06T19:59:30.000Z",
        );
    });

    it("drops invalid recent timestamps when building plot series", () => {
        const recent = {
            window: "5m" as const,
            bucketSeconds: 30,
            generatedAt: "2026-02-06T20:00:00Z",
            stationId: "station",
            series: [
                {
                    ts: "not-a-date",
                    personalActiveUsers: 4,
                    publicActiveUsers: 10,
                    personalConnectingUsers: 1,
                    publicConnectingUsers: 2,
                    personalBytesTransferred: 11,
                    publicBytesTransferred: 22,
                    bytesUp: 100,
                    bytesDown: 300,
                },
                {
                    ts: "2026-02-06T20:00:00Z",
                    personalActiveUsers: 5,
                    publicActiveUsers: 12,
                    personalConnectingUsers: 2,
                    publicConnectingUsers: 3,
                    personalBytesTransferred: 33,
                    publicBytesTransferred: 44,
                    bytesUp: 150,
                    bytesDown: 350,
                },
            ],
        };

        const personalSeries = toPersonalActiveUsersTimeseries(recent);
        const totalTrafficSeries = toTotalTrafficTimeseries(recent);

        expect(personalSeries).toHaveLength(1);
        expect(personalSeries[0].value).toBe(5);
        expect(totalTrafficSeries).toHaveLength(1);
        expect(totalTrafficSeries[0].value).toBe(500);
    });

    it("defaults recent role bytes to zero when fields are absent", () => {
        const recent = toDashboardRecentData({
            window: "5m",
            bucket_seconds: 30,
            generated_at: "2026-02-06T20:00:00Z",
            proxy_id: "station",
            series: [
                {
                    ts: "2026-02-06T20:00:00Z",
                    personal_active_users: 1,
                    public_active_users: 2,
                    personal_connecting_users: 3,
                    public_connecting_users: 4,
                    bytes_up: 100,
                    bytes_down: 200,
                },
            ],
        });

        expect(recent.series[0].personalBytesTransferred).toBe(0);
        expect(recent.series[0].publicBytesTransferred).toBe(0);
    });

    it("zero pads 48h recent series to full hourly timeline", () => {
        const recent = toDashboardRecentData({
            window: "48h",
            bucket_seconds: 3600,
            generated_at: "2026-02-10T12:00:00Z",
            proxy_id: "station",
            series: [
                {
                    ts: "2026-02-10T12:00:00Z",
                    personal_active_users: 1,
                    public_active_users: 2,
                    personal_connecting_users: 3,
                    public_connecting_users: 4,
                    personal_bytes_transferred: 10,
                    public_bytes_transferred: 20,
                    bytes_up: 100,
                    bytes_down: 200,
                },
            ],
        });

        expect(recent.series).toHaveLength(48);
        expect(recent.series[0].ts).toBe("2026-02-08T13:00:00.000Z");
        expect(recent.series[0].personalActiveUsers).toBe(0);
        expect(recent.series[0].isPadded).toBe(true);
        expect(recent.series[47].ts).toBe("2026-02-10T12:00:00Z");
        expect(recent.series[47].personalActiveUsers).toBe(1);
        expect(recent.series[47].publicConnectingUsers).toBe(4);
        expect(recent.series[47].isPadded).toBeFalsy();
    });

    it("zero pads each recent window to exact range", () => {
        const sevenDay = toDashboardRecentData({
            window: "7d",
            bucket_seconds: 6 * 3600,
            generated_at: "2026-02-10T12:00:00Z",
            proxy_id: "station",
            series: [
                {
                    ts: "2026-02-10T12:00:00Z",
                    personal_active_users: 1,
                    public_active_users: 2,
                    personal_connecting_users: 3,
                    public_connecting_users: 4,
                    personal_bytes_transferred: 10,
                    public_bytes_transferred: 20,
                    bytes_up: 100,
                    bytes_down: 200,
                },
            ],
        });
        const thirtyDay = toDashboardRecentData({
            window: "30d",
            bucket_seconds: 24 * 3600,
            generated_at: "2026-02-10T12:00:00Z",
            proxy_id: "station",
            series: [
                {
                    ts: "2026-02-10T12:00:00Z",
                    personal_active_users: 5,
                    public_active_users: 6,
                    personal_connecting_users: 1,
                    public_connecting_users: 2,
                    personal_bytes_transferred: 30,
                    public_bytes_transferred: 40,
                    bytes_up: 300,
                    bytes_down: 600,
                },
            ],
        });

        expect(sevenDay.series).toHaveLength(28);
        expect(sevenDay.series[0].isPadded).toBe(true);
        expect(sevenDay.series[27].ts).toBe("2026-02-10T12:00:00Z");
        expect(sevenDay.series[27].isPadded).toBeFalsy();

        expect(thirtyDay.series).toHaveLength(30);
        expect(thirtyDay.series[0].isPadded).toBe(true);
        expect(thirtyDay.series[29].ts).toBe("2026-02-10T12:00:00Z");
        expect(thirtyDay.series[29].isPadded).toBeFalsy();
    });

    it("aggregates summary and latest recent values", () => {
        const summaryA = toDashboardSummaryData({
            window: "24h",
            generated_at: "2026-02-06T20:00:00Z",
            proxy_id: "a",
            segments: {
                personal: {
                    active_users: 2,
                    connecting_users: 1,
                    bytes_up: 100,
                    bytes_down: 200,
                },
                public: {
                    active_users: 3,
                    connecting_users: 4,
                    bytes_up: 300,
                    bytes_down: 400,
                },
            },
        });
        const summaryB = toDashboardSummaryData({
            window: "24h",
            generated_at: "2026-02-06T20:00:00Z",
            proxy_id: "b",
            segments: {
                personal: {
                    active_users: 1,
                    connecting_users: 2,
                    bytes_up: 50,
                    bytes_down: 150,
                },
                public: {
                    active_users: 5,
                    connecting_users: 1,
                    bytes_up: 120,
                    bytes_down: 80,
                },
            },
        });
        const recentA = toDashboardRecentData({
            window: "5m",
            bucket_seconds: 30,
            generated_at: "2026-02-06T20:00:00Z",
            proxy_id: "a",
            series: [
                {
                    ts: "2026-02-06T20:00:00Z",
                    personal_active_users: 4,
                    public_active_users: 6,
                    personal_connecting_users: 2,
                    public_connecting_users: 1,
                    personal_bytes_transferred: 10,
                    public_bytes_transferred: 20,
                    bytes_up: 100,
                    bytes_down: 200,
                },
            ],
        });
        const recentB = toDashboardRecentData({
            window: "5m",
            bucket_seconds: 30,
            generated_at: "2026-02-06T20:00:00Z",
            proxy_id: "b",
            series: [
                {
                    ts: "2026-02-06T20:00:00Z",
                    personal_active_users: 1,
                    public_active_users: 2,
                    personal_connecting_users: 3,
                    public_connecting_users: 4,
                    personal_bytes_transferred: 30,
                    public_bytes_transferred: 40,
                    bytes_up: 150,
                    bytes_down: 250,
                },
            ],
        });

        expect(aggregateDashboardSummaries([summaryA, summaryB])).toEqual({
            personal: {
                connectedUsers: 3,
                connectingUsers: 3,
                bytesTransferred: 500,
            },
            public: {
                connectedUsers: 8,
                connectingUsers: 5,
                bytesTransferred: 900,
            },
            total: {
                connectedUsers: 11,
                connectingUsers: 8,
                bytesTransferred: 1400,
            },
        });

        expect(aggregateDashboardRecents([recentA, recentB])).toEqual({
            personalActiveUsers: 5,
            publicActiveUsers: 8,
            personalConnectingUsers: 5,
            publicConnectingUsers: 5,
            personalBytesTransferred: 40,
            publicBytesTransferred: 60,
        });
    });

    it("validates contract windows", () => {
        expect(() => normalizeStatsSummary({ window: "5m" })).toThrow();
        expect(() => normalizeStatsRecent({ window: "36h" })).toThrow();
    });

    it("validates live stats contract", () => {
        expect(() =>
            normalizeStatsLive({
                generated_at: "2026-02-10T12:00:00Z",
                proxy_id: "station",
                announcing: 1,
                segments: {
                    personal: {
                        connected_users: 1,
                        connecting_users: 2,
                        bytes_up_total: 10,
                        bytes_down_total: 20,
                    },
                    public: {
                        connected_users: 3,
                        connecting_users: 4,
                        bytes_up_total: 30,
                        bytes_down_total: 40,
                    },
                    total: {
                        connected_users: 4,
                        connecting_users: 6,
                        bytes_up_total: 40,
                        bytes_down_total: 60,
                    },
                },
                personal_region_activity: [
                    {
                        region: "US",
                        connected_users: 1,
                        connecting_users: 0,
                        bytes_up_total: 5,
                        bytes_down_total: 6,
                    },
                ],
                public_region_activity: [],
            }),
        ).not.toThrow();
    });

    it("adapts live response and converts to summary aggregate", () => {
        const live = toDashboardLiveData({
            generated_at: "2026-02-10T12:00:00Z",
            proxy_id: "station",
            announcing: 1,
            segments: {
                personal: {
                    connected_users: 2,
                    connecting_users: 3,
                    bytes_up_total: 100,
                    bytes_down_total: 200,
                },
                public: {
                    connected_users: 4,
                    connecting_users: 5,
                    bytes_up_total: 300,
                    bytes_down_total: 400,
                },
                total: {
                    connected_users: 6,
                    connecting_users: 8,
                    bytes_up_total: 500,
                    bytes_down_total: 700,
                },
            },
            personal_region_activity: [
                {
                    region: "US",
                    connected_users: 2,
                    connecting_users: 1,
                    bytes_up_total: 50,
                    bytes_down_total: 70,
                },
            ],
            public_region_activity: [
                {
                    region: "BR",
                    connected_users: 4,
                    connecting_users: 0,
                    bytes_up_total: 90,
                    bytes_down_total: 110,
                },
            ],
        });

        expect(live.stationId).toBe("station");
        expect(live.segments.personal.connectedUsers).toBe(2);
        expect(live.segments.public.connectingUsers).toBe(5);
        expect(live.personalRegionActivity[0]?.region).toBe("US");
        expect(live.publicRegionActivity[0]?.bytesDownTotal).toBe(110);

        expect(toDashboardSummaryAggregateFromLive(live)).toEqual({
            personal: {
                connectedUsers: 2,
                connectingUsers: 3,
                bytesTransferred: 300,
            },
            public: {
                connectedUsers: 4,
                connectingUsers: 5,
                bytesTransferred: 700,
            },
            total: {
                connectedUsers: 6,
                connectingUsers: 8,
                bytesTransferred: 1200,
            },
        });
    });

    it("selects targets with previous-first fallback order", () => {
        const targets = [
            { proxy_id: "p1", source: "hosted" as const },
            { proxy_id: "p2", source: "local" as const },
        ];

        expect(
            selectStatsTarget({
                previousProxyId: "p2",
                targets,
            }),
        ).toEqual({ selectedProxyId: "p2", usedFallback: false });

        expect(
            selectStatsTarget({
                previousProxyId: "missing",
                targets,
            }),
        ).toEqual({ selectedProxyId: "p1", usedFallback: true });

        expect(
            selectStatsTarget({
                previousProxyId: null,
                targets,
            }),
        ).toEqual({ selectedProxyId: "p1", usedFallback: false });
    });

    it("normalizes dev local proxy id input", () => {
        expect(normalizeDevLocalProxyIds(" a, b\n b\n\n c ,a,d ", 3)).toEqual([
            "a",
            "b",
            "c",
        ]);
    });
});

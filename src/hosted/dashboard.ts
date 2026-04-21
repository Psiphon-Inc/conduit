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
import type { TimeseriesDataPoint } from "@/src/components/TimeseriesPlot";
import {
    RecentWindow,
    StatsLiveResponse,
    StatsLiveResponseSchema,
    StatsRecentResponse,
    StatsRecentResponseSchema,
    StatsSessionTarget,
    StatsSummaryResponse,
    StatsSummaryResponseSchema,
    SummaryWindow,
} from "@/src/hosted/contracts";

export interface DashboardSummaryCard {
    segment: "personal" | "public";
    activeUsers: number;
    connectingUsers: number;
    bytesUp: number;
    bytesDown: number;
}

export interface DashboardSummaryData {
    window: SummaryWindow;
    generatedAt: string;
    stationId: string;
    cards: DashboardSummaryCard[];
    personalRegionActivity?: DashboardLiveRegionMetric[];
    publicRegionActivity?: DashboardLiveRegionMetric[];
}

export interface DashboardRecentPoint {
    ts: string;
    personalActiveUsers: number;
    publicActiveUsers: number;
    personalConnectingUsers: number;
    publicConnectingUsers: number;
    personalBytesTransferred: number;
    publicBytesTransferred: number;
    bytesUp: number;
    bytesDown: number;
    isPadded?: boolean;
}

export interface DashboardRecentData {
    window: RecentWindow;
    bucketSeconds: number;
    generatedAt: string;
    stationId: string;
    series: DashboardRecentPoint[];
    personalRegionActivity?: DashboardLiveRegionMetric[];
    publicRegionActivity?: DashboardLiveRegionMetric[];
}

export interface DashboardLiveSegment {
    connectedUsers: number;
    connectingUsers: number;
    bytesUpTotal: number;
    bytesDownTotal: number;
}

export interface DashboardLiveRegionMetric {
    region: string;
    connectedUsers: number;
    connectingUsers: number;
    bytesUpTotal: number;
    bytesDownTotal: number;
}

export interface DashboardLiveData {
    generatedAt: string;
    stationId: string;
    announcing: number;
    segments: {
        personal: DashboardLiveSegment;
        public: DashboardLiveSegment;
        total: DashboardLiveSegment;
    };
    personalRegionActivity: DashboardLiveRegionMetric[];
    publicRegionActivity: DashboardLiveRegionMetric[];
}

export interface DashboardRoleAggregate {
    connectedUsers: number;
    connectingUsers: number;
    bytesTransferred: number;
}

export interface DashboardSummaryAggregate {
    personal: DashboardRoleAggregate;
    public: DashboardRoleAggregate;
    total: DashboardRoleAggregate;
}

export interface DashboardRecentAggregate {
    personalActiveUsers: number;
    publicActiveUsers: number;
    personalConnectingUsers: number;
    publicConnectingUsers: number;
    personalBytesTransferred: number;
    publicBytesTransferred: number;
}

type DashboardRecentValueSelector = (point: DashboardRecentPoint) => number;

let devLocalProxyIds: string[] = [];

export function normalizeStatsSummary(input: unknown): StatsSummaryResponse {
    return StatsSummaryResponseSchema.parse(input);
}

export function normalizeStatsRecent(input: unknown): StatsRecentResponse {
    return StatsRecentResponseSchema.parse(input);
}

export function normalizeStatsLive(input: unknown): StatsLiveResponse {
    return StatsLiveResponseSchema.parse(input);
}

export function toDashboardSummaryData(input: unknown): DashboardSummaryData {
    const summary = StatsSummaryResponseSchema.parse(input);
    return {
        window: summary.window,
        generatedAt: summary.generated_at,
        stationId: summary.proxy_id,
        cards: [
            {
                segment: "personal",
                activeUsers: summary.segments.personal.active_users,
                connectingUsers: summary.segments.personal.connecting_users,
                bytesUp: summary.segments.personal.bytes_up,
                bytesDown: summary.segments.personal.bytes_down,
            },
            {
                segment: "public",
                activeUsers: summary.segments.public.active_users,
                connectingUsers: summary.segments.public.connecting_users,
                bytesUp: summary.segments.public.bytes_up,
                bytesDown: summary.segments.public.bytes_down,
            },
        ],
        personalRegionActivity: toDashboardRegionActivity(
            summary.personal_region_activity,
        ),
        publicRegionActivity: toDashboardRegionActivity(
            summary.public_region_activity,
        ),
    };
}

export function toDashboardRecentData(input: unknown): DashboardRecentData {
    const recent = StatsRecentResponseSchema.parse(input);
    const mappedSeries = recent.series.map((bucket) => ({
        ts: bucket.ts,
        personalActiveUsers: bucket.personal_active_users,
        publicActiveUsers: bucket.public_active_users,
        personalConnectingUsers: bucket.personal_connecting_users,
        publicConnectingUsers: bucket.public_connecting_users,
        personalBytesTransferred: bucket.personal_bytes_transferred ?? 0,
        publicBytesTransferred: bucket.public_bytes_transferred ?? 0,
        bytesUp: bucket.bytes_up,
        bytesDown: bucket.bytes_down,
    }));

    return {
        window: recent.window,
        bucketSeconds: recent.bucket_seconds,
        generatedAt: recent.generated_at,
        stationId: recent.proxy_id,
        series: zeroPadRecentSeries({
            window: recent.window,
            bucketSeconds: recent.bucket_seconds,
            generatedAt: recent.generated_at,
            series: mappedSeries,
        }),
        personalRegionActivity: toDashboardRegionActivity(
            recent.personal_region_activity,
        ),
        publicRegionActivity: toDashboardRegionActivity(
            recent.public_region_activity,
        ),
    };
}

export function toDashboardLiveData(input: unknown): DashboardLiveData {
    const live = StatsLiveResponseSchema.parse(input);

    return {
        generatedAt: live.generated_at,
        stationId: live.proxy_id,
        announcing: live.announcing,
        segments: {
            personal: {
                connectedUsers: live.segments.personal.connected_users,
                connectingUsers: live.segments.personal.connecting_users,
                bytesUpTotal: live.segments.personal.bytes_up_total,
                bytesDownTotal: live.segments.personal.bytes_down_total,
            },
            public: {
                connectedUsers: live.segments.public.connected_users,
                connectingUsers: live.segments.public.connecting_users,
                bytesUpTotal: live.segments.public.bytes_up_total,
                bytesDownTotal: live.segments.public.bytes_down_total,
            },
            total: {
                connectedUsers: live.segments.total.connected_users,
                connectingUsers: live.segments.total.connecting_users,
                bytesUpTotal: live.segments.total.bytes_up_total,
                bytesDownTotal: live.segments.total.bytes_down_total,
            },
        },
        personalRegionActivity: toDashboardRegionActivity(
            live.personal_region_activity,
        ),
        publicRegionActivity: toDashboardRegionActivity(
            live.public_region_activity,
        ),
    };
}

function toDashboardRegionActivity(
    activity: StatsLiveResponse["personal_region_activity"],
): DashboardLiveRegionMetric[] {
    return activity.map((point) => ({
        region: point.region,
        connectedUsers: point.connected_users,
        connectingUsers: point.connecting_users,
        bytesUpTotal: point.bytes_up_total,
        bytesDownTotal: point.bytes_down_total,
    }));
}

export function toDashboardSummaryAggregateFromLive(
    live: DashboardLiveData,
): DashboardSummaryAggregate {
    return {
        personal: {
            connectedUsers: live.segments.personal.connectedUsers,
            connectingUsers: live.segments.personal.connectingUsers,
            bytesTransferred:
                live.segments.personal.bytesUpTotal +
                live.segments.personal.bytesDownTotal,
        },
        public: {
            connectedUsers: live.segments.public.connectedUsers,
            connectingUsers: live.segments.public.connectingUsers,
            bytesTransferred:
                live.segments.public.bytesUpTotal +
                live.segments.public.bytesDownTotal,
        },
        total: {
            connectedUsers: live.segments.total.connectedUsers,
            connectingUsers: live.segments.total.connectingUsers,
            bytesTransferred:
                live.segments.total.bytesUpTotal +
                live.segments.total.bytesDownTotal,
        },
    };
}

function zeroPadRecentSeries(input: {
    window: RecentWindow;
    bucketSeconds: number;
    generatedAt: string;
    series: DashboardRecentPoint[];
}): DashboardRecentPoint[] {
    const sorted = [...input.series].sort((a, b) => a.ts.localeCompare(b.ts));

    const bucketMs = input.bucketSeconds * 1000;
    if (!Number.isFinite(bucketMs) || bucketMs <= 0) {
        return sorted;
    }

    const generatedAtMs = Date.parse(input.generatedAt);
    if (Number.isNaN(generatedAtMs)) {
        return sorted;
    }

    const windowSeconds = toRecentWindowSeconds(input.window);
    const bucketsToFill = Math.max(
        1,
        Math.round(windowSeconds / input.bucketSeconds),
    );
    const latestSeriesMs = sorted.reduce((latest, point) => {
        const pointMs = Date.parse(point.ts);
        if (Number.isNaN(pointMs)) {
            return latest;
        }
        return Math.max(latest, pointMs);
    }, Number.NEGATIVE_INFINITY);
    const alignmentBaseMs = Number.isFinite(latestSeriesMs)
        ? latestSeriesMs
        : generatedAtMs;
    const alignmentOffsetMs =
        ((alignmentBaseMs % bucketMs) + bucketMs) % bucketMs;
    const remainderMs =
        (((generatedAtMs - alignmentOffsetMs) % bucketMs) + bucketMs) %
        bucketMs;
    const alignedEndMs = generatedAtMs - remainderMs;

    const byTimestamp = new Map<number, DashboardRecentPoint>();
    for (const point of sorted) {
        const pointMs = Date.parse(point.ts);
        if (Number.isNaN(pointMs)) {
            continue;
        }
        byTimestamp.set(pointMs, point);
    }

    const padded: DashboardRecentPoint[] = [];
    for (let i = bucketsToFill - 1; i >= 0; i--) {
        const tsMs = alignedEndMs - i * bucketMs;
        const existing = byTimestamp.get(tsMs);
        if (existing) {
            padded.push(existing);
            continue;
        }
        padded.push({
            ...createZeroRecentPoint(new Date(tsMs).toISOString()),
            isPadded: true,
        });
    }

    return padded;
}

function toRecentWindowSeconds(window: RecentWindow): number {
    switch (window) {
        case "5m":
            return 5 * 60;
        case "48h":
            return 48 * 60 * 60;
        case "7d":
            return 7 * 24 * 60 * 60;
        case "30d":
            return 30 * 24 * 60 * 60;
        default:
            return 48 * 60 * 60;
    }
}

function createZeroRecentPoint(ts: string): DashboardRecentPoint {
    return {
        ts,
        personalActiveUsers: 0,
        publicActiveUsers: 0,
        personalConnectingUsers: 0,
        publicConnectingUsers: 0,
        personalBytesTransferred: 0,
        publicBytesTransferred: 0,
        bytesUp: 0,
        bytesDown: 0,
    };
}

export function aggregateDashboardSummaries(
    summaries: DashboardSummaryData[],
): DashboardSummaryAggregate {
    const personal = {
        connectedUsers: 0,
        connectingUsers: 0,
        bytesTransferred: 0,
    };
    const publicAggregate = {
        connectedUsers: 0,
        connectingUsers: 0,
        bytesTransferred: 0,
    };

    for (const summary of summaries) {
        for (const card of summary.cards) {
            const target =
                card.segment === "personal" ? personal : publicAggregate;
            target.connectedUsers += card.activeUsers;
            target.connectingUsers += card.connectingUsers;
            target.bytesTransferred += card.bytesUp + card.bytesDown;
        }
    }

    return {
        personal,
        public: publicAggregate,
        total: {
            connectedUsers:
                personal.connectedUsers + publicAggregate.connectedUsers,
            connectingUsers:
                personal.connectingUsers + publicAggregate.connectingUsers,
            bytesTransferred:
                personal.bytesTransferred + publicAggregate.bytesTransferred,
        },
    };
}

export function aggregateDashboardRecents(
    recents: DashboardRecentData[],
): DashboardRecentAggregate {
    const aggregate: DashboardRecentAggregate = {
        personalActiveUsers: 0,
        publicActiveUsers: 0,
        personalConnectingUsers: 0,
        publicConnectingUsers: 0,
        personalBytesTransferred: 0,
        publicBytesTransferred: 0,
    };

    for (const recent of recents) {
        const point = recent.series[recent.series.length - 1];
        if (!point) {
            continue;
        }
        aggregate.personalActiveUsers += point.personalActiveUsers;
        aggregate.publicActiveUsers += point.publicActiveUsers;
        aggregate.personalConnectingUsers += point.personalConnectingUsers;
        aggregate.publicConnectingUsers += point.publicConnectingUsers;
        aggregate.personalBytesTransferred += point.personalBytesTransferred;
        aggregate.publicBytesTransferred += point.publicBytesTransferred;
    }

    return aggregate;
}

export function toPersonalConnectingUsersTimeseries(
    recent: DashboardRecentData,
): TimeseriesDataPoint[] {
    return toRecentTimeseries(recent, (point) => point.personalConnectingUsers);
}

export function toPublicConnectingUsersTimeseries(
    recent: DashboardRecentData,
): TimeseriesDataPoint[] {
    return toRecentTimeseries(recent, (point) => point.publicConnectingUsers);
}

function toRecentTimeseries(
    recent: DashboardRecentData,
    valueSelector: DashboardRecentValueSelector,
): TimeseriesDataPoint[] {
    return recent.series
        .reduce<TimeseriesDataPoint[]>((output, point) => {
            const time = new Date(point.ts);
            if (Number.isNaN(time.getTime())) {
                return output;
            }
            output.push({
                time,
                value: valueSelector(point),
                isPadded: point.isPadded ?? false,
            });
            return output;
        }, [])
        .sort((a, b) => a.time.getTime() - b.time.getTime());
}

export function toPersonalActiveUsersTimeseries(
    recent: DashboardRecentData,
): TimeseriesDataPoint[] {
    return toRecentTimeseries(recent, (point) => point.personalActiveUsers);
}

export function toPublicActiveUsersTimeseries(
    recent: DashboardRecentData,
): TimeseriesDataPoint[] {
    return toRecentTimeseries(recent, (point) => point.publicActiveUsers);
}

export function toBytesUpTimeseries(
    recent: DashboardRecentData,
): TimeseriesDataPoint[] {
    return toRecentTimeseries(recent, (point) => point.bytesUp);
}

export function toPersonalBytesTransferredTimeseries(
    recent: DashboardRecentData,
): TimeseriesDataPoint[] {
    return toRecentTimeseries(
        recent,
        (point) => point.personalBytesTransferred,
    );
}

export function toPublicBytesTransferredTimeseries(
    recent: DashboardRecentData,
): TimeseriesDataPoint[] {
    return toRecentTimeseries(recent, (point) => point.publicBytesTransferred);
}

export function toBytesDownTimeseries(
    recent: DashboardRecentData,
): TimeseriesDataPoint[] {
    return toRecentTimeseries(recent, (point) => point.bytesDown);
}

export function toTotalTrafficTimeseries(
    recent: DashboardRecentData,
): TimeseriesDataPoint[] {
    return toRecentTimeseries(
        recent,
        (point) => point.bytesUp + point.bytesDown,
    );
}

export function selectStatsTarget(input: {
    previousProxyId: string | null;
    targets: StatsSessionTarget[];
}): { selectedProxyId: string; usedFallback: boolean } {
    if (
        input.previousProxyId &&
        input.targets.some(
            (target) => target.proxy_id === input.previousProxyId,
        )
    ) {
        return {
            selectedProxyId: input.previousProxyId,
            usedFallback: false,
        };
    }

    const firstTarget = input.targets[0]?.proxy_id;
    if (!firstTarget) {
        throw new Error("Stats session returned no targets");
    }
    return {
        selectedProxyId: firstTarget,
        usedFallback: input.previousProxyId != null,
    };
}

export function normalizeDevLocalProxyIds(input: string, max = 10): string[] {
    const output: string[] = [];
    const seen = new Set<string>();
    const fragments = input.split(/[\n,]/g);

    for (const fragment of fragments) {
        const candidate = fragment.trim();
        if (!candidate || seen.has(candidate)) {
            continue;
        }
        seen.add(candidate);
        output.push(candidate);
        if (output.length >= max) {
            break;
        }
    }

    return output;
}

export function setDevLocalProxyIds(ids: string[]): void {
    devLocalProxyIds = [...ids];
}

export function getDevLocalProxyIds(): string[] {
    return [...devLocalProxyIds];
}

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
import { TimeseriesDataPoint } from "@/src/common/timeseries";
import type { HostedStatusPanelTimeseries } from "@/src/components/HostedStatusPanel";
import { RecentWindow } from "@/src/hosted/contracts";
import {
    DashboardLiveRegionMetric,
    DashboardSummaryAggregate,
} from "@/src/hosted/dashboard/transforms";
import {
    InproxyActivityByPeriod,
    InproxyActivityRegion,
    InproxyActivitySegment,
    InproxyActivitySegments,
    InproxyRegionalBreakdownByWindow,
} from "@/src/inproxy/types";

export function toLocalRegionalWindowKey(
    window: RecentWindow,
): keyof InproxyRegionalBreakdownByWindow {
    switch (window) {
        case "7d":
            return "7d";
        case "30d":
            return "30d";
        case "48h":
            return "48h";
        case "5m":
        default:
            return "48h";
    }
}

export function toDashboardRegionMetrics(
    regionActivity: InproxyActivityRegion[],
): DashboardLiveRegionMetric[] {
    return regionActivity.map((region) => ({
        region: region.region,
        connectedUsers: region.connectedClients,
        connectingUsers: region.connectingClients,
        bytesUpTotal: region.bytesUp,
        bytesDownTotal: region.bytesDown,
    }));
}

export function hasLocalDashboardHistory(
    segments: InproxyActivitySegments,
): boolean {
    return (
        hasSegmentHistory(segments.personal) ||
        hasSegmentHistory(segments.common) ||
        hasSegmentHistory(segments.total)
    );
}

function hasSegmentHistory(segment: InproxyActivitySegment): boolean {
    if (
        segment.totalBytesUp > 0 ||
        segment.totalBytesDown > 0 ||
        segment.currentConnectedClients > 0 ||
        segment.currentConnectingClients > 0
    ) {
        return true;
    }

    return (
        hasPeriodHistory(segment.dataByPeriod["1000ms"]) ||
        (segment.dataByPeriod["3600000ms"]
            ? hasPeriodHistory(segment.dataByPeriod["3600000ms"])
            : false)
    );
}

function hasPeriodHistory(period: InproxyActivityByPeriod): boolean {
    return (
        period.bytesUp.some((value) => value > 0) ||
        period.bytesDown.some((value) => value > 0) ||
        period.connectedClients.some((value) => value > 0) ||
        period.connectingClients.some((value) => value > 0)
    );
}

export function toLocalStatusTimeseries(input: {
    segments: InproxyActivitySegments;
    window: RecentWindow;
}): HostedStatusPanelTimeseries {
    const periodKey = input.window === "5m" ? "1000ms" : "3600000ms";
    const periodMs = periodKey === "1000ms" ? 1_000 : 3_600_000;
    const nowMs = Date.now();
    const personal = slicePeriodToWindow(
        getSegmentPeriod(input.segments.personal, periodKey),
        input.window,
        periodKey,
    );
    const common = slicePeriodToWindow(
        getSegmentPeriod(input.segments.common, periodKey),
        input.window,
        periodKey,
    );

    return {
        bytesTransferred: {
            personal: toTimeseriesPoints(
                combineTransferred(personal),
                periodMs,
                nowMs,
            ),
            public: toTimeseriesPoints(
                combineTransferred(common),
                periodMs,
                nowMs,
            ),
        },
        connectedUsers: {
            personal: toTimeseriesPoints(
                personal.connectedClients,
                periodMs,
                nowMs,
            ),
            public: toTimeseriesPoints(
                common.connectedClients,
                periodMs,
                nowMs,
            ),
        },
        connectingUsers: {
            personal: toTimeseriesPoints(
                personal.connectingClients,
                periodMs,
                nowMs,
            ),
            public: toTimeseriesPoints(
                common.connectingClients,
                periodMs,
                nowMs,
            ),
        },
    };
}

function getSegmentPeriod(
    segment: InproxyActivitySegment,
    period: "1000ms" | "3600000ms",
): InproxyActivityByPeriod {
    if (period === "1000ms") {
        return segment.dataByPeriod["1000ms"];
    }

    const hourly = segment.dataByPeriod["3600000ms"];
    if (hourly) {
        return hourly;
    }

    const numBuckets = 720;
    return {
        bytesUp: new Array(numBuckets).fill(0),
        bytesDown: new Array(numBuckets).fill(0),
        announcingWorkers: new Array(numBuckets).fill(0),
        connectingClients: new Array(numBuckets).fill(0),
        connectedClients: new Array(numBuckets).fill(0),
        numBuckets,
    };
}

function slicePeriodToWindow(
    period: InproxyActivityByPeriod,
    window: RecentWindow,
    periodKey: "1000ms" | "3600000ms",
): InproxyActivityByPeriod {
    const maxBuckets = localWindowBucketCount(window, periodKey);
    if (maxBuckets >= period.numBuckets) {
        return period;
    }

    return {
        bytesUp: sliceTail(period.bytesUp, maxBuckets),
        bytesDown: sliceTail(period.bytesDown, maxBuckets),
        announcingWorkers: sliceTail(period.announcingWorkers, maxBuckets),
        connectingClients: sliceTail(period.connectingClients, maxBuckets),
        connectedClients: sliceTail(period.connectedClients, maxBuckets),
        numBuckets: maxBuckets,
    };
}

function localWindowBucketCount(
    window: RecentWindow,
    periodKey: "1000ms" | "3600000ms",
): number {
    if (periodKey === "1000ms") {
        return 300;
    }

    switch (window) {
        case "48h":
            return 48;
        case "7d":
            return 7 * 24;
        case "30d":
            return 30 * 24;
        case "5m":
        default:
            return 48;
    }
}

function sliceTail(values: number[], count: number): number[] {
    if (count <= 0) {
        return [];
    }
    if (values.length <= count) {
        return values;
    }
    return values.slice(values.length - count);
}

function toTimeseriesPoints(
    values: number[],
    periodMs: number,
    nowMs: number,
): TimeseriesDataPoint[] {
    if (values.length === 0) {
        return [];
    }
    const startMs = nowMs - (values.length - 1) * periodMs;
    return values.map((value, index) => ({
        time: new Date(startMs + index * periodMs),
        value,
    }));
}

function combineTransferred(period: InproxyActivityByPeriod): number[] {
    const size = Math.min(period.bytesUp.length, period.bytesDown.length);
    const output = new Array<number>(size);
    for (let index = 0; index < size; index += 1) {
        output[index] = period.bytesUp[index] + period.bytesDown[index];
    }
    return output;
}

export function toLocalSummaryAggregate(
    segments: InproxyActivitySegments,
): DashboardSummaryAggregate {
    const personal = {
        connectedUsers: segments.personal.currentConnectedClients,
        connectingUsers: segments.personal.currentConnectingClients,
        bytesTransferred:
            segments.personal.totalBytesUp + segments.personal.totalBytesDown,
    };
    const publicSegment = {
        connectedUsers: segments.common.currentConnectedClients,
        connectingUsers: segments.common.currentConnectingClients,
        bytesTransferred:
            segments.common.totalBytesUp + segments.common.totalBytesDown,
    };

    return {
        personal,
        public: publicSegment,
        total: {
            connectedUsers:
                segments.total.currentConnectedClients ||
                personal.connectedUsers + publicSegment.connectedUsers,
            connectingUsers:
                segments.total.currentConnectingClients ||
                personal.connectingUsers + publicSegment.connectingUsers,
            bytesTransferred:
                segments.total.totalBytesUp + segments.total.totalBytesDown,
        },
    };
}

export function sumTransferredFromSegment(
    segment: InproxyActivitySegment,
    period: "1000ms" | "3600000ms",
): number {
    const buckets = getSegmentPeriod(segment, period);
    const size = Math.min(buckets.bytesUp.length, buckets.bytesDown.length);
    let sum = 0;
    for (let index = 0; index < size; index += 1) {
        sum += buckets.bytesUp[index] + buckets.bytesDown[index];
    }
    return sum;
}

export function sumRegionActivityBytes(
    regions: InproxyActivityRegion[],
): number {
    let sum = 0;
    for (const region of regions) {
        sum += region.bytesUp + region.bytesDown;
    }
    return sum;
}

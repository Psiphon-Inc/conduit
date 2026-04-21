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

/**
 * Merges two parallel timeseries arrays by summing their values point-by-point.
 */
export function combineTimeseries(
    personal: TimeseriesDataPoint[],
    publicSeries: TimeseriesDataPoint[],
): TimeseriesDataPoint[] {
    return personal.map((personalPoint, index) => {
        const publicPoint = publicSeries[index];
        return {
            time: personalPoint.time,
            value: personalPoint.value + (publicPoint?.value ?? 0),
            isPadded:
                Boolean(personalPoint.isPadded) &&
                Boolean(publicPoint?.isPadded ?? personalPoint.isPadded),
        };
    });
}

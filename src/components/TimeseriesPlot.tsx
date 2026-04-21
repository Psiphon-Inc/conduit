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
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import {
    Circle,
    ClipPath,
    Defs,
    G,
    Line,
    LinearGradient,
    Path,
    Rect,
    Stop,
    Svg,
    Text as SvgText,
} from "react-native-svg";

import { clamp } from "@/src/common/mathUtils";
import { palette, sharedStyles as ss } from "@/src/styles";

export interface TimeseriesDataPoint {
    time: Date;
    value: number;
    isPadded?: boolean;
}

export interface TimeseriesSeries {
    label: string;
    color: string;
    data: TimeseriesDataPoint[];
    highlightArea?: boolean;
    curve?: "smooth" | "step";
}

export type TimeseriesScale = "24h" | "7d" | "30d" | "max";

export const generateSyntheticTestData = (scale: TimeseriesScale) => {
    const now = Date.now();
    const points: TimeseriesDataPoint[] = [];
    let hoursPerChunk = 0.2;
    let numPoints = 24 * 5;
    switch (scale) {
        case "24h":
            break;
        case "7d":
            numPoints = 7 * (24 / 3);
            hoursPerChunk = 3;
            break;
        case "30d":
            numPoints = 30;
            hoursPerChunk = 24;
            break;
        case "max":
            numPoints = 52;
            hoursPerChunk = 168;
            break;
        default:
            break;
    }

    const a = [1.3e-2, 8.4e-3, 1.7e-2];
    const b = [1.3e-2, 1.4e-3, 2.2e-2];
    const p = [1.3e-2, 0.4e-2, 2.2e-3];
    for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const segmentIndex = Math.min(Math.floor(t * 3), 2);
        const parabola =
            a[segmentIndex] +
            b[segmentIndex] * (1 - Math.pow(p[segmentIndex] * t - 1, 2));
        const jitter = (Math.random() - 0.5) * 4.3e-3;
        const value = Math.max(0, parabola + jitter);

        points.push({
            time: new Date(
                now - (numPoints - i) * 60 * 60 * 1000 * hoursPerChunk,
            ),
            value,
        });
    }

    return points;
};

interface SanitizedSeries {
    label: string;
    color: string;
    highlightArea: boolean;
    curve: "smooth" | "step";
    data: TimeseriesDataPoint[];
}

export interface TimeseriesPlotProps {
    data?: TimeseriesDataPoint[];
    series?: TimeseriesSeries[];
    width: number;
    height: number;
    color?: string;
    xAxisLabel?: string;
    yAxisLabel?: string;
    yAxisUnits?: string;
    showAxisLines?: boolean;
    showGrid?: boolean;
    highlightArea?: boolean;
    numYTicks?: number;
    numXTicks?: number;
    showLegend?: boolean;
    lineWidth?: number;
    referenceTimeMs?: number;
    valueFormatter?: (value: number) => string;
}

export function TimeseriesPlot({
    data = [],
    series,
    width,
    height,
    color = palette.blue,
    xAxisLabel,
    yAxisLabel,
    yAxisUnits,
    showAxisLines = false,
    showGrid = true,
    highlightArea = true,
    numYTicks = 5,
    numXTicks = 4,
    showLegend = true,
    lineWidth = 2.5,
    referenceTimeMs,
    valueFormatter,
}: TimeseriesPlotProps) {
    const { t } = useTranslation();
    const axisMargin = { top: 30, right: 12, bottom: 36, left: 80 };
    const plotWidth = width - axisMargin.left - axisMargin.right;
    const plotHeight = height - axisMargin.top - axisMargin.bottom;
    const clipIdRef = React.useRef(
        `timeseries-clip-${Math.random().toString(36).slice(2)}`,
    );
    const [hiddenLabels, setHiddenLabels] = React.useState<Set<string>>(
        new Set(),
    );

    const inputSeries = React.useMemo(() => {
        if (series && series.length > 0) {
            return series;
        }
        return [
            {
                label: yAxisLabel ?? "Series",
                color,
                data,
                highlightArea,
            },
        ];
    }, [color, data, highlightArea, series, yAxisLabel]);

    // All series (including hidden) — sanitized for valid data points.
    const allSanitizedSeries = React.useMemo(() => {
        return inputSeries
            .map<SanitizedSeries>((item) => ({
                label: item.label,
                color: item.color,
                highlightArea: item.highlightArea ?? false,
                curve: item.curve ?? "smooth",
                data: item.data
                    .filter(
                        (point) =>
                            Number.isFinite(point.value) &&
                            Number.isFinite(point.time.getTime()),
                    )
                    .sort((a, b) => a.time.getTime() - b.time.getTime()),
            }))
            .filter((item) => item.data.length > 0);
    }, [inputSeries]);

    // Only visible series — used for axis calculations and rendering.
    const sanitizedSeries = React.useMemo(() => {
        if (hiddenLabels.size === 0) {
            return allSanitizedSeries;
        }
        return allSanitizedSeries.filter(
            (item) => !hiddenLabels.has(item.label),
        );
    }, [allSanitizedSeries, hiddenLabels]);

    const allPoints = React.useMemo(
        () => sanitizedSeries.flatMap((item) => item.data),
        [sanitizedSeries],
    );
    const measuredPoints = React.useMemo(
        () => allPoints.filter((point) => !point.isPadded),
        [allPoints],
    );

    if (allPoints.length === 0) {
        return (
            <View
                style={{
                    width,
                    height,
                    borderWidth: 1,
                    borderColor: palette.grey,
                    borderRadius: 8,
                    justifyContent: "center",
                    alignItems: "center",
                }}
            >
                <Text style={{ color: palette.midGrey, fontSize: 12 }}>
                    {t("NO_RECENT_DATA_YET_I18N.string")}
                </Text>
            </View>
        );
    }

    const hasMeasuredPoints = measuredPoints.length > 0;

    const safeNumYTicks = Math.max(2, numYTicks);
    const safeNumXTicks = Math.max(2, numXTicks);

    const values = (hasMeasuredPoints ? measuredPoints : allPoints).map(
        (d) => d.value,
    );
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const rawValueRange = maxValue - minValue;
    const topValuePadding =
        rawValueRange > 0
            ? rawValueRange * 0.12
            : Math.max(Math.abs(maxValue) * 0.04, 1);
    const minPlotValue = 0;
    const maxPlotValue = maxValue + topValuePadding;
    const valueRange = maxPlotValue - minPlotValue || 1;

    const times = allPoints.map((d) => d.time.getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const timeRange = maxTime - minTime || 1;

    const domainMaxTime = Number.isFinite(referenceTimeMs ?? NaN)
        ? Math.max(maxTime, referenceTimeMs as number)
        : maxTime;
    const domainMinTime = domainMaxTime - timeRange;
    const domainTimeRange = domainMaxTime - domainMinTime || 1;

    type PlotPoint = { x: number; y: number; isPadded: boolean };

    const toPlotPoints = (points: TimeseriesDataPoint[]): PlotPoint[] => {
        return points.map((point) => {
            const x =
                ((point.time.getTime() - domainMinTime) / domainTimeRange) *
                plotWidth;
            const y =
                plotHeight -
                ((point.value - minPlotValue) / valueRange) * plotHeight;
            return {
                x: clamp(x, 0, plotWidth),
                y: clamp(y, 0, plotHeight),
                isPadded: point.isPadded ?? false,
            };
        });
    };

    const buildSmoothPath = (points: PlotPoint[]) => {
        if (points.length === 0) {
            return "";
        }
        if (points.length === 1) {
            return `M ${points[0].x},${points[0].y}`;
        }

        const controlPoint = (
            current: PlotPoint,
            previous: PlotPoint | null,
            next: PlotPoint | null,
            reverse: boolean = false,
        ): PlotPoint => {
            const smoothing = 0.2;
            const p = previous || current;
            const n = next || current;
            const tangentX = n.x - p.x;
            const tangentY = n.y - p.y;
            const factor = reverse ? -smoothing : smoothing;

            return {
                x: clamp(current.x + tangentX * factor, 0, plotWidth),
                y: clamp(current.y + tangentY * factor, 0, plotHeight),
                isPadded: current.isPadded,
            };
        };

        let path = `M ${points[0].x},${points[0].y}`;
        for (let i = 0; i < points.length - 1; i++) {
            const current = points[i];
            const next = points[i + 1];
            const previous = i > 0 ? points[i - 1] : null;
            const subsequent = i < points.length - 2 ? points[i + 2] : null;

            const cp1 = controlPoint(current, previous, next);
            const cp2 = controlPoint(next, current, subsequent, true);
            path += ` C ${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${next.x},${next.y}`;
        }
        return path;
    };

    const buildStepPath = (points: PlotPoint[]) => {
        if (points.length === 0) {
            return "";
        }
        if (points.length === 1) {
            return `M ${points[0].x},${points[0].y}`;
        }

        let path = `M ${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            path += ` H ${points[i].x} V ${points[i].y}`;
        }
        return path;
    };

    const buildAreaPath = (linePath: string, points: PlotPoint[]) => {
        if (points.length < 2 || !linePath) {
            return "";
        }
        let path = linePath;
        path += ` L ${points[points.length - 1].x},${plotHeight}`;
        path += ` L ${points[0].x},${plotHeight}`;
        path += " Z";
        return path;
    };

    const splitMeasuredSegments = (
        points: PlotPoint[],
        includePadded: boolean,
    ): PlotPoint[][] => {
        if (includePadded) {
            return points.length > 0 ? [points] : [];
        }

        const segments: PlotPoint[][] = [];
        let current: PlotPoint[] = [];

        for (const point of points) {
            if (point.isPadded) {
                if (current.length > 0) {
                    segments.push(current);
                    current = [];
                }
                continue;
            }
            current.push(point);
        }

        if (current.length > 0) {
            segments.push(current);
        }

        return segments;
    };

    const plottedSeries = sanitizedSeries.map((item, index) => {
        const points = toPlotPoints(item.data);
        const segments = splitMeasuredSegments(points, !hasMeasuredPoints).map(
            (segment, segmentIndex) => {
                const linePath =
                    item.curve === "step"
                        ? buildStepPath(segment)
                        : buildSmoothPath(segment);
                const areaPath = buildAreaPath(linePath, segment);
                return {
                    segment,
                    linePath,
                    areaPath,
                    key: `${item.label}-${segmentIndex}`,
                };
            },
        );
        return {
            ...item,
            segments,
            gradientId: `timeseriesGradient-${index}`,
        };
    });

    const leadingMarkers = React.useMemo(() => {
        if (!hasMeasuredPoints || plottedSeries.length === 0) {
            return [];
        }

        return sanitizedSeries
            .map((sourceSeries, index) => {
                const latestMeasured = [...sourceSeries.data]
                    .reverse()
                    .find((point) => !point.isPadded);
                if (!latestMeasured) {
                    return null;
                }

                const x =
                    ((latestMeasured.time.getTime() - domainMinTime) /
                        domainTimeRange) *
                    plotWidth;
                const y =
                    plotHeight -
                    ((latestMeasured.value - minPlotValue) / valueRange) *
                        plotHeight;

                return {
                    x: clamp(x, 0, plotWidth),
                    y: clamp(y, 0, plotHeight),
                    valueLabel: formatDisplayValue(latestMeasured.value),
                    color: plottedSeries[index]?.color ?? sourceSeries.color,
                };
            })
            .filter(
                (
                    marker,
                ): marker is {
                    x: number;
                    y: number;
                    valueLabel: string;
                    color: string;
                } => marker !== null,
            );
    }, [
        domainMinTime,
        domainTimeRange,
        hasMeasuredPoints,
        maxPlotValue,
        minPlotValue,
        plotHeight,
        plotWidth,
        plottedSeries,
        sanitizedSeries,
        valueRange,
        valueFormatter,
        yAxisUnits,
    ]);

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        const timeRangeHours = domainTimeRange / (1000 * 60 * 60);

        if (timeRangeHours <= 72) {
            return `${date.getHours()}:${date.getMinutes().toString().padStart(2, "0")}`;
        }
        if (timeRangeHours <= 7 * 24) {
            const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            return days[date.getDay()];
        }
        if (timeRangeHours <= 90 * 24) {
            return `${date.toLocaleString("en-US", { month: "short" })} ${date.getDate()}`;
        }
        return `${date.getFullYear()} ${date.toLocaleString("en-US", { month: "short" })}`;
    };

    function formatValue(value: number) {
        if (Math.abs(value) >= 1000) {
            return Math.round(value).toString();
        }
        if (Math.abs(value) >= 100) {
            return value.toFixed(0);
        }
        if (Math.abs(value) >= 10) {
            return value.toFixed(1);
        }
        return value
            .toFixed(2)
            .replace(/\.0+$/, "")
            .replace(/(\.\d*[1-9])0+$/, "$1");
    }

    function formatDisplayValue(value: number): string {
        if (valueFormatter) {
            return valueFormatter(value);
        }
        const formatted = formatValue(value);
        if (!yAxisUnits) {
            return formatted;
        }
        return `${formatted} ${yAxisUnits}`;
    }

    const yTicks = Array.from({ length: safeNumYTicks }, (_, i) => {
        const value = minPlotValue + (valueRange * i) / (safeNumYTicks - 1);
        const y =
            plotHeight - ((value - minPlotValue) / valueRange) * plotHeight;
        return { value, y };
    });

    const xTicks = Array.from({ length: safeNumXTicks }, (_, i) => {
        const time =
            domainMinTime + (domainTimeRange * i) / (safeNumXTicks - 1);
        const x = ((time - domainMinTime) / domainTimeRange) * plotWidth;
        return { time, x };
    });
    const hasPaddedPoints = allPoints.some((point) => point.isPadded);
    const firstMeasuredTime = hasMeasuredPoints
        ? Math.min(...measuredPoints.map((point) => point.time.getTime()))
        : Number.POSITIVE_INFINITY;
    const paddedBoundaryX = hasPaddedPoints
        ? hasMeasuredPoints && firstMeasuredTime > domainMinTime
            ? ((firstMeasuredTime - domainMinTime) / domainTimeRange) *
              plotWidth
            : !hasMeasuredPoints
              ? plotWidth
              : 0
        : 0;

    return (
        <View style={{ width, height }}>
            <Svg width={width} height={height}>
                <Defs>
                    <ClipPath id={clipIdRef.current}>
                        <Rect
                            x={0}
                            y={0}
                            width={plotWidth}
                            height={plotHeight}
                        />
                    </ClipPath>
                    {plottedSeries.map((item) => (
                        <LinearGradient
                            key={item.gradientId}
                            id={item.gradientId}
                            x1="0%"
                            y1="0%"
                            x2="0%"
                            y2="100%"
                        >
                            <Stop
                                offset="0%"
                                stopColor={item.color}
                                stopOpacity={0.3}
                            />
                            <Stop
                                offset="100%"
                                stopColor="transparent"
                                stopOpacity={0}
                            />
                        </LinearGradient>
                    ))}
                </Defs>

                <G
                    transform={`translate(${axisMargin.left}, ${axisMargin.top})`}
                >
                    <G clipPath={`url(#${clipIdRef.current})`}>
                        {paddedBoundaryX > 0 ? (
                            <Rect
                                x={0}
                                y={0}
                                width={paddedBoundaryX}
                                height={plotHeight}
                                fill={palette.purple}
                                fillOpacity={0.06}
                            />
                        ) : null}
                        {paddedBoundaryX > 0 ? (
                            <Line
                                x1={paddedBoundaryX}
                                y1={0}
                                x2={paddedBoundaryX}
                                y2={plotHeight}
                                stroke={palette.thinPurple}
                                strokeWidth={1}
                                strokeDasharray="3,3"
                            />
                        ) : null}
                        {showGrid &&
                            yTicks.map((tick, i) => (
                                <Line
                                    key={`y-grid-${i}`}
                                    x1={0}
                                    y1={tick.y}
                                    x2={plotWidth}
                                    y2={tick.y}
                                    stroke={palette.thinPurple}
                                    strokeWidth={1}
                                    strokeOpacity={0.45}
                                    strokeDasharray="4,4"
                                />
                            ))}

                        {showGrid &&
                            xTicks.map((tick, i) => (
                                <Line
                                    key={`x-grid-${i}`}
                                    x1={tick.x}
                                    y1={0}
                                    x2={tick.x}
                                    y2={plotHeight}
                                    stroke={palette.thinPurple}
                                    strokeWidth={1}
                                    strokeOpacity={0.45}
                                    strokeDasharray="4,4"
                                />
                            ))}

                        {plottedSeries.map((item) =>
                            item.segments.map((segment) =>
                                item.highlightArea ? (
                                    <Path
                                        key={`${segment.key}-area`}
                                        d={segment.areaPath}
                                        fill={`url(#${item.gradientId})`}
                                        strokeWidth={0}
                                    />
                                ) : null,
                            ),
                        )}

                        {plottedSeries.map((item) =>
                            item.segments.map((segment) => (
                                <Path
                                    key={`${segment.key}-line`}
                                    d={segment.linePath}
                                    stroke={item.color}
                                    strokeWidth={lineWidth}
                                    strokeOpacity={hasMeasuredPoints ? 1 : 0.35}
                                    fill="none"
                                />
                            )),
                        )}
                    </G>

                    {showAxisLines && (
                        <Line
                            x1={0}
                            y1={plotHeight}
                            x2={plotWidth}
                            y2={plotHeight}
                            stroke={palette.midGrey}
                            strokeWidth={1}
                        />
                    )}
                    {showAxisLines && (
                        <Line
                            x1={0}
                            y1={0}
                            x2={0}
                            y2={plotHeight}
                            stroke={palette.midGrey}
                            strokeWidth={1}
                        />
                    )}

                    {leadingMarkers.map((marker, i) => (
                        <G key={`leading-marker-${i}`}>
                            <Circle
                                cx={marker.x}
                                cy={marker.y}
                                r={4.5}
                                fill={marker.color}
                                stroke={palette.white}
                                strokeWidth={1.5}
                            />
                            <SvgText
                                x={marker.x}
                                y={Math.max(12, marker.y - 8 - i * 14)}
                                fill={marker.color}
                                fontSize={11}
                                fontWeight="600"
                                textAnchor="middle"
                            >
                                {marker.valueLabel}
                            </SvgText>
                        </G>
                    ))}
                </G>
            </Svg>

            <View
                style={{
                    position: "absolute",
                    left: 0,
                    top: axisMargin.top,
                    width: axisMargin.left - 4,
                }}
            >
                {yTicks.map((tick, i) => (
                    <Text
                        key={`y-label-${i}`}
                        numberOfLines={1}
                        style={{
                            position: "absolute",
                            left: 4,
                            right: 4,
                            top: tick.y - 14,
                            fontSize: 11,
                            color: palette.midGrey,
                            textAlign: "right",
                        }}
                    >
                        {formatDisplayValue(tick.value)}
                    </Text>
                ))}
            </View>

            <View
                style={{
                    position: "absolute",
                    top: height - 25,
                    left: axisMargin.left,
                }}
            >
                {xTicks.map((tick, i) => (
                    <Text
                        key={`x-label-${i}`}
                        style={{
                            position: "absolute",
                            left: tick.x - 20,
                            fontSize: 10,
                            color: palette.midGrey,
                        }}
                    >
                        {formatTime(tick.time)}
                    </Text>
                ))}
            </View>

            {yAxisLabel ? (
                <Text
                    numberOfLines={1}
                    style={{
                        position: "absolute",
                        left: 5,
                        top: 0,
                        maxWidth: width * 0.5,
                        fontSize: 12,
                        fontWeight: "600",
                        color: palette.midGrey,
                    }}
                >
                    {yAxisLabel}
                </Text>
            ) : null}

            {xAxisLabel ? (
                <Text
                    style={{
                        position: "absolute",
                        right: 5,
                        bottom: 5,
                        fontSize: 12,
                        fontWeight: "600",
                        color: palette.midGrey,
                    }}
                >
                    {xAxisLabel}
                </Text>
            ) : null}

            {paddedBoundaryX > 50 ? (
                <Text
                    style={{
                        position: "absolute",
                        left: axisMargin.left + 8,
                        top: axisMargin.top + 4,
                        fontSize: 10,
                        color: palette.midGrey,
                    }}
                >
                    {t("NO_DATA_YET_I18N.string")}
                </Text>
            ) : null}

            {showLegend && allSanitizedSeries.length > 1 ? (
                <View
                    style={{
                        position: "absolute",
                        right: 6,
                        top: 6,
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 6,
                        justifyContent: "flex-end",
                    }}
                >
                    {allSanitizedSeries.map((item) => {
                        const isHidden = hiddenLabels.has(item.label);
                        return (
                            <Pressable
                                key={`${item.label}-legend`}
                                onPress={() => {
                                    setHiddenLabels((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(item.label)) {
                                            next.delete(item.label);
                                        } else if (
                                            next.size <
                                            allSanitizedSeries.length - 1
                                        ) {
                                            next.add(item.label);
                                        }
                                        return next;
                                    });
                                }}
                                hitSlop={4}
                                style={[
                                    ss.row,
                                    ss.alignCenter,
                                    ss.nogap,
                                    {
                                        gap: 6,
                                        opacity: isHidden ? 0.35 : 1,
                                    },
                                ]}
                            >
                                <View
                                    style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: 5,
                                        backgroundColor: item.color,
                                    }}
                                />
                                <Text
                                    style={[
                                        ss.tinyFont,
                                        ss.blackText,
                                        isHidden && {
                                            textDecorationLine: "line-through",
                                        },
                                    ]}
                                >
                                    {item.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            ) : null}
        </View>
    );
}

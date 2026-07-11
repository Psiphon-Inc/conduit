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
import * as Haptics from "expo-haptics";
import React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { formatBytes } from "@/src/common/formatters";
import { TimeseriesDataPoint } from "@/src/common/timeseries";
import {
    TimeseriesPlot,
    TimeseriesSeries,
} from "@/src/components/TimeseriesPlot";
import { palette, sharedStyles as ss } from "@/src/styles";

export type HostedStatusMode = "bytes" | "connected";

interface HostedStatusSeriesSplit {
    personal: TimeseriesDataPoint[];
    public: TimeseriesDataPoint[];
}

export interface HostedStatusPanelTimeseries {
    bytesTransferred: HostedStatusSeriesSplit;
    connectedUsers: HostedStatusSeriesSplit;
    connectingUsers: HostedStatusSeriesSplit;
}

export function HostedStatusPanel({
    timeseries,
    mode,
    onModeChange,
    statusNotice,
    chartNotice,
    onChartNoticePress,
    referenceTimeMs,
    isLoading = false,
}: {
    timeseries?: HostedStatusPanelTimeseries;
    mode: HostedStatusMode;
    onModeChange: (mode: HostedStatusMode) => void;
    statusNotice?: string | null;
    chartNotice?: string | null;
    onChartNoticePress?: () => void;
    referenceTimeMs?: number;
    /** When true, show a loading indicator over the chart area
     *  (e.g. while fetching data for a newly-selected time window). */
    isLoading?: boolean;
}) {
    const { t } = useTranslation();
    const [plotWidth, setPlotWidth] = React.useState(0);

    const activeSeries = React.useMemo<TimeseriesSeries[]>(() => {
        if (!timeseries) {
            return [];
        }

        const source =
            mode === "connected"
                ? timeseries.connectedUsers
                : timeseries.bytesTransferred;

        return [
            {
                label: t("SCOPE_PERSONAL_I18N.string"),
                color: "rgba(156, 129, 201, 1)",
                data: source.personal,
                curve: "smooth" as const,
            },
            {
                label: t("SCOPE_COMMON_I18N.string"),
                color: "rgba(241, 159, 139, 1)",
                data: source.public,
                curve: "smooth" as const,
            },
        ];
    }, [mode, timeseries]);

    const yAxisLabel =
        mode === "bytes"
            ? t("TRANSFERRED_PER_INTERVAL_I18N.string")
            : t("CONNECTED_USERS_I18N.string");
    const valueFormatter =
        mode === "bytes" ? (value: number) => formatBytes(value) : undefined;

    return (
        <View
            style={{
                position: "relative",
                borderRadius: 12,
                backgroundColor: "rgba(25, 18, 36, 0.06)",
                padding: 10,
                gap: 8,
            }}
        >
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingRight: statusNotice ? 122 : 0,
                }}
            >
                <HostedStatusModeButton
                    label={t("CONNECTED_I18N.string")}
                    selected={mode === "connected"}
                    onPress={() => onModeChange("connected")}
                />
                <HostedStatusModeButton
                    label={t("BYTES_I18N.string")}
                    selected={mode === "bytes"}
                    onPress={() => onModeChange("bytes")}
                />
            </View>
            {statusNotice ? (
                <Text
                    style={[
                        ss.tinyFont,
                        ss.blackText,
                        {
                            position: "absolute",
                            top: 12,
                            right: 10,
                            opacity: 0.8,
                        },
                    ]}
                >
                    {statusNotice}
                </Text>
            ) : null}
            <View
                // Fixed height and natural (full) width so the chart area
                // occupies its final size on the first frame; the plot itself
                // renders once the width has been measured, avoiding a
                // narrow-then-expand layout shift as the dashboard opens.
                style={{ height: 235 }}
                onLayout={(event) => {
                    setPlotWidth(event.nativeEvent.layout.width);
                }}
            >
                {isLoading || plotWidth === 0 ? (
                    <View
                        style={{
                            width: "100%",
                            height: 235,
                            justifyContent: "center",
                            alignItems: "center",
                        }}
                    >
                        {isLoading ? (
                            <ActivityIndicator
                                size="small"
                                color={palette.midGrey}
                            />
                        ) : null}
                    </View>
                ) : (
                    <TimeseriesPlot
                        width={plotWidth}
                        height={235}
                        series={activeSeries}
                        plotNotice={chartNotice}
                        onPlotNoticePress={onChartNoticePress}
                        referenceTimeMs={referenceTimeMs}
                        yAxisLabel={yAxisLabel}
                        valueFormatter={valueFormatter}
                        showAxisLines
                        numYTicks={5}
                        numXTicks={8}
                        showLegend={true}
                        lineWidth={3}
                    />
                )}
            </View>
        </View>
    );
}

function HostedStatusModeButton({
    label,
    selected,
    onPress,
}: {
    label: string;
    selected: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={() => {
                Haptics.selectionAsync();
                onPress();
            }}
            style={{
                borderRadius: 8,
                backgroundColor: selected
                    ? palette.selectedPurple
                    : "rgba(25, 18, 36, 0.08)",
                paddingHorizontal: 10,
                paddingVertical: 6,
            }}
        >
            <Text
                style={[
                    ss.tinyFont,
                    {
                        color: selected ? palette.white : palette.midGrey,
                    },
                ]}
            >
                {label}
            </Text>
        </Pressable>
    );
}

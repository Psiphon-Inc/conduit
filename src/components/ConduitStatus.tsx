/*
 * Copyright (c) 2024, Psiphon Inc.
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
import { Text, View } from "react-native";

import { palette, sharedStyles as ss } from "@/src/styles";

export interface ConduitStatusProps {
    /** Conduit alias / station name */
    alias: string;
    /** Whether to show the local conduit section (Android only) */
    showLocal: boolean;
    /** Local common/public connected peers */
    localPublicConnected: number;
    /** Whether the local conduit is running */
    localIsOnline: boolean;
    /** Whether to show the hosted conduit section */
    showHosted: boolean;
    /** Hosted public connected peers */
    hostedPublicConnected: number;
    /** Combined personal pairing connected peers */
    personalPairingConnected: number;
}

export function ConduitStatus(props: ConduitStatusProps) {
    const { t } = useTranslation();

    const {
        alias,
        showLocal,
        localPublicConnected,
        localIsOnline,
        showHosted,
        hostedPublicConnected,
        personalPairingConnected,
    } = props;

    const hasAnyContent = showLocal || showHosted;
    if (!hasAnyContent) {
        return null;
    }

    const metricFontSize = 17;
    const metricColor = "rgba(35, 30, 40, 0.78)";
    const showPersonalPairing =
        showHosted ||
        !showLocal ||
        localIsOnline ||
        personalPairingConnected > 0;
    const summaryRows = [
        showLocal
            ? {
                  label: t("LOCAL_CONDUIT_I18N.string", {
                      defaultValue: "Local Conduit",
                  }),
                  value: localIsOnline
                      ? localPublicConnected
                      : t("HOME_SUMMARY_OFFLINE_I18N.string", {
                            defaultValue: "OFFLINE",
                        }),
              }
            : null,
        showHosted
            ? {
                  label: t("HOSTED_CONDUIT_FALLBACK_I18N.string", {
                      defaultValue: "Hosted Conduit",
                  }),
                  value: hostedPublicConnected,
              }
            : null,
        showPersonalPairing
            ? {
                  label: t("PERSONAL_PAIRING_TITLE_I18N.string", {
                      defaultValue: "Personal Pairing",
                  }),
                  value: personalPairingConnected,
              }
            : null,
    ].filter(
        (row): row is { label: string; value: number | string } => row != null,
    );

    return (
        <View
            style={{
                alignItems: "stretch",
                paddingHorizontal: 20,
                paddingVertical: 0,
                marginTop: -60,
                gap: 6,
            }}
        >
            {alias.trim().length > 0 ? (
                <Text
                    numberOfLines={1}
                    style={[
                        ss.bodyFont,
                        {
                            color: palette.black,
                            fontSize: 26,
                            letterSpacing: 1,
                            textAlign: "center",
                        },
                    ]}
                >
                    {alias}
                </Text>
            ) : null}

            <View style={{ gap: 2 }}>
                {summaryRows.map((row) => (
                    <View
                        key={row.label}
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                        }}
                    >
                        <Text
                            style={[
                                ss.bodyFont,
                                {
                                    flex: 1,
                                    fontSize: metricFontSize,
                                    color: metricColor,
                                    letterSpacing: 0.6,
                                    textAlign: "left",
                                },
                            ]}
                        >
                            {row.label}
                        </Text>
                        <Text
                            style={[
                                ss.bodyFont,
                                {
                                    fontSize: metricFontSize,
                                    color: metricColor,
                                    letterSpacing: 0.6,
                                    textAlign: "right",
                                },
                            ]}
                        >
                            {formatSummaryValue(t, row.value)}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

function formatSummaryValue(
    t: (key: string, options?: Record<string, unknown>) => string,
    value: number | string,
): string {
    if (typeof value === "string") {
        return value;
    }

    return t("HOME_SUMMARY_PEER_COUNT_I18N.string", {
        count: value,
        defaultValue: value === 1 ? "{{count}} peer" : "{{count}} peers",
    });
}

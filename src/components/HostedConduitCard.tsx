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
import { Image } from "expo-image";
import React from "react";
import { useTranslation } from "react-i18next";
import { StyleProp, Text, View, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";

import { HostedMiniOrb } from "@/src/components/HostedMiniOrb";
import { Identicon } from "@/src/components/Identicon";
import { getScopeIcon, getScopeLabel } from "@/src/hosted/conduitDisplay";
import { ConduitView } from "@/src/hosted/contracts";
import { palette, sharedStyles as ss } from "@/src/styles";

export function HostedConduitCard({
    conduit,
    connectedCount,
    variant = "inline",
    style,
    orbStyle,
}: {
    conduit: ConduitView;
    connectedCount: number;
    variant?: "inline" | "stacked";
    style?: StyleProp<ViewStyle>;
    orbStyle?: StyleProp<ViewStyle>;
}) {
    const { t } = useTranslation();
    const scopeIcon = getScopeIcon(conduit.traffic_scope);
    const scopeLabel = getScopeLabel(conduit.traffic_scope);

    return (
        <View style={[{ alignItems: "center" }, style]}>
            {variant === "stacked" ? (
                <View style={[ss.column, { alignItems: "center", gap: 6 }]}>
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        {scopeIcon ? (
                            <Image
                                source={scopeIcon}
                                tintColor={palette.midGrey}
                                style={{
                                    width: 16,
                                    height: 16,
                                    opacity: 0.72,
                                }}
                                contentFit="contain"
                            />
                        ) : null}
                        {scopeLabel ? (
                            <Text
                                numberOfLines={1}
                                style={[
                                    ss.tinyFont,
                                    {
                                        fontSize: 13,
                                        color: palette.midGrey,
                                        opacity: 0.72,
                                        textTransform: "uppercase",
                                        letterSpacing: 0.5,
                                    },
                                ]}
                            >
                                {scopeLabel}
                            </Text>
                        ) : null}
                        {conduit.proxy_id ? (
                            <View
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 4,
                                }}
                            >
                                <View
                                    style={{
                                        width: 22,
                                        height: 22,
                                        borderRadius: 11,
                                        borderColor: palette.deepMauve,
                                        overflow: "hidden",
                                    }}
                                >
                                    <Identicon
                                        value={conduit.proxy_id}
                                        size={22}
                                    />
                                </View>
                                <Text
                                    numberOfLines={1}
                                    style={[
                                        ss.tinyFont,
                                        {
                                            fontSize: 13,
                                            color: palette.midGrey,
                                            opacity: 0.72,
                                            letterSpacing: 0.3,
                                        },
                                    ]}
                                >
                                    ({conduit.proxy_id.substring(0, 4)}...)
                                </Text>
                            </View>
                        ) : null}
                    </View>
                    <Text
                        numberOfLines={1}
                        style={[
                            ss.tinyFont,
                            ss.blackText,
                            { fontSize: 15, textAlign: "center" },
                        ]}
                    >
                        {t("CONNECTED_COUNT_I18N.string", {
                            count: connectedCount,
                        })}
                    </Text>
                </View>
            ) : (
                <View style={[ss.column, { alignItems: "center", gap: 4 }]}>
                    {orbStyle ? (
                        <Animated.View style={orbStyle}>
                            <HostedMiniOrb
                                label=""
                                connectedCount={connectedCount}
                                connectingCount={0}
                                width={140}
                                height={140}
                                showDetails={false}
                            />
                        </Animated.View>
                    ) : (
                        <HostedMiniOrb
                            label=""
                            connectedCount={connectedCount}
                            connectingCount={0}
                            width={140}
                            height={140}
                            showDetails={false}
                        />
                    )}
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        {scopeIcon ? (
                            <Image
                                source={scopeIcon}
                                tintColor={palette.midGrey}
                                style={{
                                    width: 14,
                                    height: 14,
                                    opacity: 0.72,
                                }}
                                contentFit="contain"
                            />
                        ) : null}
                        {scopeLabel ? (
                            <Text
                                numberOfLines={1}
                                style={[
                                    ss.tinyFont,
                                    {
                                        fontSize: 12,
                                        color: palette.midGrey,
                                        opacity: 0.72,
                                        textTransform: "uppercase",
                                        letterSpacing: 0.5,
                                    },
                                ]}
                            >
                                {scopeLabel}
                            </Text>
                        ) : null}
                        {conduit.proxy_id ? (
                            <View
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 4,
                                }}
                            >
                                <View
                                    style={{
                                        width: 20,
                                        height: 20,
                                        borderRadius: 10,
                                        borderColor: palette.deepMauve,
                                        overflow: "hidden",
                                    }}
                                >
                                    <Identicon
                                        value={conduit.proxy_id}
                                        size={20}
                                    />
                                </View>
                                <Text
                                    numberOfLines={1}
                                    style={[
                                        ss.tinyFont,
                                        {
                                            fontSize: 12,
                                            color: palette.midGrey,
                                            opacity: 0.72,
                                            letterSpacing: 0.3,
                                        },
                                    ]}
                                >
                                    ({conduit.proxy_id.substring(0, 4)}...)
                                </Text>
                            </View>
                        ) : null}
                    </View>
                    <Text
                        numberOfLines={1}
                        style={[
                            ss.tinyFont,
                            ss.blackText,
                            { fontSize: 13, textAlign: "center" },
                        ]}
                    >
                        {t("CONNECTED_COUNT_I18N.string", {
                            count: connectedCount,
                        })}
                    </Text>
                </View>
            )}
        </View>
    );
}

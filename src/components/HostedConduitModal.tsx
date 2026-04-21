/*
 * Copyright (c) 2025, Psiphon Inc.
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
import { Platform, Pressable, Text, View } from "react-native";

import { useConduitActions } from "@/src/components/ConduitActionsContext";
import { Icon } from "@/src/components/Icon";
import { Identicon } from "@/src/components/Identicon";
import { resolvePreferredRyveName } from "@/src/components/ryveClaim";
import { useConduitName } from "@/src/hooks";
import { ConduitView } from "@/src/hosted/contracts";
import { palette, sharedStyles as ss } from "@/src/styles";

export function HostedConduitModal({
    conduit,
    connectedCount,
    bytesTransferred,
    onViewDashboard: _onViewDashboard,
    onClose,
    onSetAsMain,
}: {
    conduit: ConduitView;
    connectedCount: number;
    bytesTransferred: number;
    onViewDashboard: () => void;
    onClose: () => void;
    /** When provided, shows a "Set as main" button that promotes this
     *  conduit to the big center orb slot. */
    onSetAsMain?: () => void;
}) {
    const { t } = useTranslation();
    const { data: conduitName } = useConduitName();
    const { openRyveClaimModal } = useConduitActions();

    const scopeLabel = getScopeLabel(conduit.traffic_scope, t);
    const showClaimButton = Boolean(conduit.ryve_claim);
    const stationAlias =
        resolvePreferredRyveName(conduitName) ??
        t("HOSTED_CONDUIT_FALLBACK_I18N.string");

    return (
        <Pressable
            onPress={onClose}
            style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "rgba(0, 0, 0, 0.16)",
            }}
        >
            <Pressable
                onPress={(event) => {
                    event.stopPropagation();
                }}
                style={{
                    width: "80%",
                    backgroundColor: palette.white,
                    borderRadius: 18,
                    overflow: "hidden",
                }}
            >
                <View
                    style={{
                        padding: 14,
                        paddingBottom: 18,
                        gap: 12,
                    }}
                >
                    {/* Top row: scope label + close */}
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}
                    >
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                            }}
                        >
                            {scopeLabel ? (
                                <Text
                                    numberOfLines={1}
                                    style={[
                                        ss.bodyFont,
                                        {
                                            fontSize: 17,
                                            color: palette.midGrey,
                                            textTransform: "uppercase",
                                            letterSpacing: 0.8,
                                        },
                                    ]}
                                >
                                    {scopeLabel}
                                </Text>
                            ) : null}
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t(
                                "CLOSE_CONDUIT_DETAILS_ACCESSIBILITY_I18N.string",
                            )}
                            onPress={onClose}
                            hitSlop={10}
                        >
                            <Icon
                                name="close"
                                color={palette.lightGrey}
                                size={22}
                            />
                        </Pressable>
                    </View>

                    {/* Stats + identicon */}
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}
                    >
                        <View style={{ gap: 3, flex: 1 }}>
                            <Text
                                numberOfLines={1}
                                style={[
                                    ss.bodyFont,
                                    ss.blackText,
                                    { fontSize: 16 },
                                ]}
                            >
                                {t("CONNECTED_PEERS_I18N.string", {
                                    peers: connectedCount,
                                })}
                            </Text>
                            <Text
                                numberOfLines={1}
                                style={[
                                    ss.bodyFont,
                                    ss.blackText,
                                    { fontSize: 16 },
                                ]}
                            >
                                {t("TOTAL_BYTES_TRANSFERRED_I18N.string", {
                                    niceBytes:
                                        formatByteLabel(bytesTransferred),
                                })}
                            </Text>
                        </View>
                        {conduit.proxy_id ? (
                            <View
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 8,
                                }}
                            >
                                <View
                                    style={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: 15,
                                        borderColor: palette.deepMauve,
                                        overflow: "hidden",
                                    }}
                                >
                                    <Identicon
                                        value={conduit.proxy_id}
                                        size={30}
                                    />
                                </View>
                                <Text
                                    numberOfLines={1}
                                    style={[
                                        ss.tinyFont,
                                        {
                                            fontSize: 11,
                                            color: palette.midGrey,
                                            opacity: 0.72,
                                            letterSpacing: 0.3,
                                        },
                                    ]}
                                >
                                    {conduit.proxy_id.slice(0, 6)}...
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    {/* Claim in Ryve CTA (common scope) */}
                    {showClaimButton ? (
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                                if (conduit.ryve_claim) {
                                    onClose();
                                    openRyveClaimModal(
                                        conduit.ryve_claim,
                                        stationAlias,
                                    );
                                }
                            }}
                            style={{
                                flexDirection: "row",
                                justifyContent: "center",
                                alignItems: "center",
                                gap: 8,
                                paddingVertical: 10,
                                paddingHorizontal: 20,
                                borderWidth: 1.5,
                                borderColor: palette.purple,
                                borderRadius: 15,
                                alignSelf: "stretch",
                            }}
                        >
                            <Text
                                style={[
                                    ss.bodyFont,
                                    {
                                        fontSize: 16,
                                        color: palette.purple,
                                        letterSpacing: 0.3,
                                    },
                                ]}
                            >
                                {t("CLAIM_REWARDS_I18N.string")}
                            </Text>
                            <Icon
                                name="right-arrow"
                                color={palette.purple}
                                size={12}
                            />
                        </Pressable>
                    ) : null}

                    {/* Set as main orb */}
                    {onSetAsMain ? (
                        <Pressable
                            accessibilityRole="button"
                            onPress={onSetAsMain}
                            style={{
                                alignSelf: "center",
                                paddingVertical: 8,
                                paddingHorizontal: 12,
                            }}
                        >
                            <Text
                                style={[
                                    ss.bodyFont,
                                    {
                                        fontSize: 15,
                                        color: palette.midGrey,
                                        letterSpacing: 0.3,
                                    },
                                ]}
                            >
                                {t("SET_AS_MAIN_ORB_I18N.string")}
                            </Text>
                        </Pressable>
                    ) : null}
                </View>
            </Pressable>
        </Pressable>
    );
}

function getScopeLabel(
    scope: ConduitView["traffic_scope"],
    t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
    if (scope === "personal") {
        if (Platform.OS === "android") {
            return t("HOSTED_PERSONAL_SCOPE_I18N.string", {
                defaultValue: "Hosted Personal",
            });
        }
        return t("SCOPE_PERSONAL_I18N.string");
    }
    if (scope === "public") {
        if (Platform.OS === "android") {
            return t("HOSTED_PUBLIC_SCOPE_I18N.string", {
                defaultValue: "Hosted Public",
            });
        }
        return t("SCOPE_COMMON_I18N.string");
    }
    return null;
}

function formatByteLabel(bytes: number): string {
    if (bytes < 1000) {
        return `${bytes} B`;
    }
    if (bytes < 1000 * 1000) {
        return `${(bytes / 1000).toFixed(1)} kB`;
    }
    if (bytes < 1000 * 1000 * 1000) {
        return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
    }
    if (bytes < 1000 * 1000 * 1000 * 1000) {
        return `${(bytes / (1000 * 1000 * 1000)).toFixed(1)} GB`;
    }
    return `${(bytes / (1000 * 1000 * 1000 * 1000)).toFixed(2)} TB`;
}

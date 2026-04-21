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

import { useConduitActions } from "@/src/components/ConduitActionsContext";
import { Icon } from "@/src/components/Icon";
import { Identicon } from "@/src/components/Identicon";
import { RyveCallToAction } from "@/src/components/RyveCallToAction";
import { palette, sharedStyles as ss } from "@/src/styles";

export function LocalConduitModal({
    connectedCount,
    bytesTransferred,
    proxyId,
    onClose,
    onTurnOff,
}: {
    connectedCount: number;
    bytesTransferred: number;
    proxyId?: string | null;
    onClose: () => void;
    onTurnOff: () => void;
}) {
    const { t } = useTranslation();
    const { openPersonalPairingModal } = useConduitActions();

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
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}
                    >
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
                            {t("LOCAL_CONDUIT_I18N.string", {
                                defaultValue: "Local Conduit",
                            })}
                        </Text>
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
                        {proxyId ? (
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
                                    <Identicon value={proxyId} size={30} />
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
                                    {proxyId.slice(0, 6)}...
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                            onClose();
                            openPersonalPairingModal();
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
                            {t("SHARE_PERSONAL_PAIRING_I18N.string")}
                        </Text>
                        <Icon
                            name="right-arrow"
                            color={palette.purple}
                            size={12}
                        />
                    </Pressable>

                    <RyveCallToAction
                        triggerLabel={t("CLAIM_LOCAL_REWARDS_I18N.string")}
                        renderTrigger={(onPress) => (
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => {
                                    onClose();
                                    onPress();
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
                                    {t("CLAIM_LOCAL_REWARDS_I18N.string")}
                                </Text>
                                <Icon
                                    name="right-arrow"
                                    color={palette.purple}
                                    size={12}
                                />
                            </Pressable>
                        )}
                    />

                    <Pressable
                        accessibilityRole="button"
                        onPress={onTurnOff}
                        style={{
                            flexDirection: "row",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: 8,
                            paddingVertical: 10,
                            paddingHorizontal: 20,
                            borderRadius: 15,
                            alignSelf: "stretch",
                        }}
                    >
                        <Text
                            style={[
                                ss.bodyFont,
                                {
                                    fontSize: 16,
                                    color: palette.red,
                                    letterSpacing: 0.3,
                                },
                            ]}
                        >
                            {t("TURN_OFF_I18N.string", {
                                defaultValue: "Turn Off",
                            })}
                        </Text>
                    </Pressable>
                </View>
            </Pressable>
        </Pressable>
    );
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

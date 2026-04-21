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
import { Image as ExpoImage } from "expo-image";
import React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSharedValue, withDelay, withTiming } from "react-native-reanimated";

import { Icon } from "@/src/components/Icon";
import { useInproxyStatus } from "@/src/inproxy/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

export function ActionsArea({
    width,
    height,
    hostedCallToActionMode,
    hasRecentHostedSignIn,
    showProvisioning,
    showRenew,
    renewExpiresAt,
    onRenew,
    onSharePersonalPairing,
    onHostedCallToActionPress,
}: {
    width: number;
    height: number;
    hostedCallToActionMode:
        | "loading"
        | "setup"
        | "restore"
        | "preparing"
        | "share";
    hasRecentHostedSignIn?: boolean;
    showProvisioning?: boolean;
    showRenew?: boolean;
    renewExpiresAt?: string;
    onRenew?: () => void;
    onSharePersonalPairing: () => void | Promise<void>;
    onHostedCallToActionPress?: () => void;
}) {
    const { t } = useTranslation();
    const { data: inproxyStatus } = useInproxyStatus();

    // Fade in gradient on app start
    const fadeIn = useSharedValue(0);
    const fader = useSharedValue(0);
    const shouldAnimateIn = React.useRef(true);
    const shouldAnimateOut = React.useRef(true);

    React.useEffect(() => {
        if (inproxyStatus !== "UNKNOWN") {
            fadeIn.value = withDelay(0, withTiming(1, { duration: 2000 }));
        }
        if (inproxyStatus === "RUNNING") {
            if (shouldAnimateIn.current) {
                fader.value = withTiming(1, { duration: 1000 });
                shouldAnimateIn.current = false;
                shouldAnimateOut.current = true;
            }
        } else if (inproxyStatus === "STOPPED") {
            if (shouldAnimateOut.current) {
                fader.value = withTiming(0, { duration: 1000 });
                shouldAnimateIn.current = true;
                shouldAnimateOut.current = false;
            }
        }
    }, [inproxyStatus]);

    return (
        <View
            style={[
                {
                    position: "absolute",
                    bottom: 0,
                    width: width,
                    height: height,
                    justifyContent: "space-between",
                    alignItems: "center",
                },
            ]}
        >
            <View style={{ width: "100%", paddingHorizontal: 10, gap: 10 }}>
                {showProvisioning ? (
                    <ProvisioningIndicator />
                ) : showRenew ? null : (
                    <HostedCallToAction
                        onPress={() => {
                            if (onHostedCallToActionPress) {
                                onHostedCallToActionPress();
                                return;
                            }
                            if (hostedCallToActionMode === "loading") {
                                return;
                            }
                            if (hostedCallToActionMode === "preparing") {
                                return;
                            }
                            if (hostedCallToActionMode === "share") {
                                void onSharePersonalPairing();
                                return;
                            }
                            return;
                        }}
                        mode={hostedCallToActionMode}
                        hasRecentHostedSignIn={hasRecentHostedSignIn}
                    />
                )}
                {!showProvisioning && showRenew && onRenew ? (
                    <Pressable
                        onPress={onRenew}
                        style={{
                            borderRadius: 30,
                            borderWidth: 2,
                            borderColor: palette.purple,
                            backgroundColor: "rgba(255, 255, 255, 0.35)",
                            paddingHorizontal: 20,
                            paddingTop: 14,
                            paddingBottom: 16,
                        }}
                    >
                        <View style={{ gap: 10 }}>
                            <View
                                style={{
                                    position: "relative",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    minHeight: 36,
                                    paddingHorizontal: 28,
                                }}
                            >
                                <Text
                                    style={[
                                        ss.purpleText,
                                        ss.bodyFont,
                                        ss.centeredText,
                                        {
                                            fontSize: 22,
                                            lineHeight: 28,
                                        },
                                    ]}
                                >
                                    {t("RENEW_SUBSCRIPTION_I18N.string")}
                                </Text>
                                <View
                                    style={{
                                        position: "absolute",
                                        right: 0,
                                        top: 1,
                                    }}
                                >
                                    <Icon
                                        name="right-arrow"
                                        color={palette.purple}
                                        size={20}
                                    />
                                </View>
                            </View>
                            <Text
                                style={[
                                    ss.purpleText,
                                    {
                                        fontSize: 17,
                                        lineHeight: 21,
                                        fontFamily: "JuraRegular",
                                    },
                                ]}
                            >
                                {t(
                                    "RENEW_SUBSCRIPTION_DESCRIPTION_I18N.string",
                                    {
                                        expiresAt: renewExpiresAt ?? "",
                                    },
                                )}
                            </Text>
                        </View>
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}

function ProvisioningIndicator() {
    const { t } = useTranslation();
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 20,
                borderWidth: 2,
                borderColor: palette.purple,
                backgroundColor: "rgba(255, 255, 255, 0.35)",
                paddingHorizontal: 20,
                paddingVertical: 12,
                gap: 10,
                opacity: 0.65,
            }}
        >
            <ActivityIndicator size="small" color={palette.purple} />
            <Text style={[ss.purpleText, ss.bodyFont, { fontSize: 18 }]}>
                {t("SETTING_UP_INFRASTRUCTURE_I18N.string")}
            </Text>
        </View>
    );
}

function HostedCallToAction({
    onPress,
    mode,
    hasRecentHostedSignIn,
}: {
    onPress: () => void;
    mode: "loading" | "setup" | "restore" | "preparing" | "share";
    hasRecentHostedSignIn?: boolean;
}) {
    const { t } = useTranslation();
    const isDisabled = mode === "loading" || mode === "preparing";
    const useCompactButton =
        mode === "loading" || mode === "preparing" || mode === "share";

    if (useCompactButton) {
        return (
            <Pressable
                onPress={onPress}
                disabled={isDisabled}
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 20,
                    borderWidth: 2,
                    borderColor: palette.purple,
                    backgroundColor: "rgba(255, 255, 255, 0.35)",
                    paddingHorizontal: mode === "share" ? 16 : 20,
                    paddingVertical: 12,
                    gap: 10,
                    opacity: isDisabled ? 0.65 : 1,
                }}
            >
                {mode === "share" ? (
                    <ExpoImage
                        source={require("@/assets/images/icons/p2p_24px.svg")}
                        tintColor={palette.purple}
                        style={{ width: 20, height: 20 }}
                        contentFit="contain"
                    />
                ) : mode === "loading" || mode === "preparing" ? (
                    <ActivityIndicator size="small" color={palette.purple} />
                ) : null}
                <Text style={[ss.purpleText, ss.bodyFont, { fontSize: 18 }]}>
                    {mode === "loading"
                        ? t("LOADING_HOSTED_STATUS_I18N.string")
                        : mode === "preparing"
                          ? t("PREPARING_PERSONAL_PAIRING_I18N.string", {
                                defaultValue: "Preparing personal pairing...",
                            })
                          : t("SHARE_PERSONAL_PAIRING_I18N.string")}
                </Text>
            </Pressable>
        );
    }

    const cardTitle =
        mode === "restore"
            ? t("RESTORE_YOUR_CONDUIT_I18N.string")
            : hasRecentHostedSignIn
              ? t("VIEW_YOUR_CONDUIT_I18N.string")
              : t("HOST_A_STATION_I18N.string");
    const cardDescription =
        mode === "restore"
            ? t("RESTORE_CONDUIT_DESCRIPTION_I18N.string")
            : hasRecentHostedSignIn
              ? t("VIEW_YOUR_CONDUIT_DESCRIPTION_I18N.string")
              : t("CREATE_A_PSIPHON_HOSTED_STATION_DESCRIPTION_I18N.string");

    return (
        <Pressable
            onPress={onPress}
            disabled={isDisabled}
            style={{
                borderRadius: 30,
                borderWidth: 2,
                borderColor: palette.purple,
                backgroundColor: "rgba(255, 255, 255, 0.35)",
                paddingHorizontal: 20,
                paddingTop: 14,
                paddingBottom: 16,
                opacity: isDisabled ? 0.65 : 1,
            }}
        >
            <View style={{ gap: 10 }}>
                <View
                    style={{
                        position: "relative",
                        justifyContent: "center",
                        alignItems: "center",
                        minHeight: 36,
                        paddingHorizontal: 28,
                    }}
                >
                    <Text
                        style={[
                            ss.purpleText,
                            ss.bodyFont,
                            ss.centeredText,
                            {
                                fontSize: 22,
                                lineHeight: 28,
                            },
                        ]}
                    >
                        {cardTitle}
                    </Text>
                    {!isDisabled ? (
                        <View
                            style={{
                                position: "absolute",
                                right: 0,
                                top: 1,
                            }}
                        >
                            <Icon
                                name="right-arrow"
                                color={palette.purple}
                                size={20}
                            />
                        </View>
                    ) : null}
                </View>

                <Text
                    style={[
                        ss.purpleText,
                        {
                            fontSize: 17,
                            lineHeight: 21,
                            fontFamily: "JuraRegular",
                        },
                    ]}
                >
                    {cardDescription}
                </Text>
            </View>
        </Pressable>
    );
}

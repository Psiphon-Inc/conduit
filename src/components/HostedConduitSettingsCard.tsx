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
import { useMutation } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Linking,
    Pressable,
    Text,
    View,
} from "react-native";

import { toErrorString } from "@/src/common/errors";
import { formatExpiresAt } from "@/src/common/formatters";
import { readOptionalStringField } from "@/src/common/recordUtils";
import { Icon } from "@/src/components/Icon";
import { resolveManageBillingUrl } from "@/src/hosted/billingUtils";
import { readHostedRuntimeConfig } from "@/src/hosted/config";
import {
    useHostedExperienceActions,
    useHostedExperienceState,
} from "@/src/hosted/experience/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

export function HostedConduitSettingsCard() {
    const { t } = useTranslation();
    const router = useRouter();
    const state = useHostedExperienceState();
    const actions = useHostedExperienceActions();
    const hostedConfig = React.useMemo(readHostedRuntimeConfig, []);

    const [expanded, setExpanded] = React.useState(false);
    const [actionError, setActionError] = React.useState<string | null>(null);

    const entitlementSnapshot =
        (state.conduitsSnapshot?.entitlement as Record<string, unknown>) ??
        null;
    const manageBillingUrl = React.useMemo(
        () =>
            resolveManageBillingUrl(hostedConfig.baseUrl, entitlementSnapshot),
        [entitlementSnapshot, hostedConfig.baseUrl],
    );
    const subscriptionStatus =
        readOptionalStringField(entitlementSnapshot, "status") ??
        state.entitlementSnapshot;
    const expiresAt = readOptionalStringField(
        entitlementSnapshot,
        "expires_at",
    );

    const signOutMutation = useMutation({
        mutationFn: async () => {
            await actions.signOut();
        },
        onMutate: () => {
            setActionError(null);
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });

    const resetHcbStateMutation = useMutation({
        mutationFn: async () => {
            await actions.signOut();
        },
        onMutate: () => {
            setActionError(null);
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });

    const renewMutation = useMutation({
        mutationFn: async () => {
            router.push({
                pathname: "/(app)/hosted-setup",
                params: { intent: "renew" },
            });
        },
        onMutate: () => {
            setActionError(null);
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });
    const effectiveStatus = subscriptionStatus;
    const isExpired =
        effectiveStatus === "expired" || effectiveStatus === "inactive";
    const showRenew = effectiveStatus === "canceled_not_expired";

    const actionPending =
        signOutMutation.isPending ||
        resetHcbStateMutation.isPending ||
        renewMutation.isPending;

    const rowStyle = {
        flexDirection: "row" as const,
        justifyContent: "space-between" as const,
        alignItems: "baseline" as const,
        paddingVertical: 6,
    };
    const labelStyle = [ss.tinyFont, ss.blackText, { opacity: 0.6 }];
    const valueStyle = [
        ss.tinyFont,
        ss.blackText,
        { flexShrink: 1, textAlign: "right" as const },
    ];

    const statusDisplay = String(effectiveStatus ?? "\u2014");
    const statusColor =
        effectiveStatus === "active"
            ? "#2e7d32"
            : isExpired
              ? palette.red
              : effectiveStatus === "canceled_not_expired"
                ? "#c77700"
                : undefined;

    const isSignedOut = state.authPhase === "signed_out";

    return (
        <View style={[ss.column, { gap: 2 }]}>
            {isSignedOut ? (
                <Pressable
                    onPress={() => {
                        router.push("/(app)/hosted-setup");
                    }}
                    style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        minHeight: 40,
                    }}
                >
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                        }}
                    >
                        <ExpoImage
                            source={require("@/assets/images/icons/account.svg")}
                            tintColor={palette.black}
                            style={{ width: 20, height: 20 }}
                            contentFit="contain"
                        />
                        <Text style={[ss.bodyFont, ss.blackText]}>
                            {t("ACCOUNT_I18N.string")}
                        </Text>
                    </View>
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        <Text style={[ss.bodyFont, ss.purpleText]}>
                            {t("SIGN_IN_I18N.string")}
                        </Text>
                        <Icon
                            name="chevron-right"
                            color={palette.purple}
                            size={16}
                        />
                    </View>
                </Pressable>
            ) : (
                <Pressable
                    onPress={() => setExpanded((v) => !v)}
                    style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        minHeight: 40,
                    }}
                >
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                        }}
                    >
                        <ExpoImage
                            source={require("@/assets/images/icons/account.svg")}
                            tintColor={palette.black}
                            style={{ width: 20, height: 20 }}
                            contentFit="contain"
                        />
                        <Text style={[ss.bodyFont, ss.blackText]}>
                            {t("ACCOUNT_I18N.string")}
                        </Text>
                    </View>
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        <Text
                            style={[
                                ss.tinyFont,
                                statusColor
                                    ? { color: statusColor }
                                    : ss.blackText,
                            ]}
                        >
                            {statusDisplay}
                        </Text>
                        <View
                            style={{
                                transform: [
                                    { rotate: expanded ? "180deg" : "0deg" },
                                ],
                            }}
                        >
                            <Icon
                                name="chevron-down"
                                color={palette.black}
                                size={16}
                            />
                        </View>
                    </View>
                </Pressable>
            )}

            {!isSignedOut && showRenew ? (
                <Pressable
                    onPress={() => {
                        renewMutation.mutate();
                    }}
                    disabled={actionPending}
                    style={{
                        flexDirection: "row",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: 10,
                        paddingVertical: 12,
                        paddingHorizontal: 24,
                        backgroundColor: palette.purple,
                        borderRadius: 12,
                        alignSelf: "stretch",
                        marginTop: 10,
                        opacity: actionPending ? 0.5 : 1,
                    }}
                >
                    {renewMutation.isPending ? (
                        <ActivityIndicator size="small" color={palette.white} />
                    ) : (
                        <>
                            <Text
                                style={[
                                    ss.bodyFont,
                                    {
                                        color: palette.white,
                                        fontSize: 14,
                                        letterSpacing: 0.5,
                                    },
                                ]}
                            >
                                {t("RENEW_SUBSCRIPTION_I18N.string")}
                            </Text>
                            <Icon
                                name="right-arrow"
                                color={palette.white}
                                size={14}
                            />
                        </>
                    )}
                </Pressable>
            ) : null}

            {!isSignedOut && actionError ? (
                <Text
                    style={[ss.tinyFont, { color: palette.red, paddingTop: 4 }]}
                >
                    {actionError}
                </Text>
            ) : null}

            {!isSignedOut && expanded ? (
                <View>
                    {expiresAt ? (
                        <View style={rowStyle}>
                            <Text style={labelStyle}>
                                {t("RENEWS_EXPIRES_I18N.string")}
                            </Text>
                            <Text style={valueStyle}>
                                {formatExpiresAt(expiresAt)}
                            </Text>
                        </View>
                    ) : null}

                    <View style={rowStyle}>
                        <Text style={labelStyle}>
                            {t("ACCOUNT_I18N.string")}
                        </Text>
                        <Text
                            numberOfLines={1}
                            style={[
                                ...valueStyle,
                                { fontSize: 11, fontFamily: "JuraRegular" },
                            ]}
                        >
                            {state.session?.accountId ?? "\u2014"}
                        </Text>
                    </View>

                    <View
                        style={{
                            flexDirection: "row",
                            justifyContent: "flex-end",
                            alignItems: "center",
                            paddingTop: 8,
                            gap: 16,
                        }}
                    >
                        {manageBillingUrl ? (
                            <Pressable
                                onPress={() => {
                                    void Linking.openURL(
                                        manageBillingUrl,
                                    ).catch((error) => {
                                        setActionError(toErrorString(error));
                                    });
                                }}
                                disabled={actionPending}
                            >
                                <Text
                                    style={[
                                        ss.tinyFont,
                                        ss.purpleText,
                                        {
                                            textDecorationLine: "underline",
                                            opacity: actionPending ? 0.5 : 1,
                                        },
                                    ]}
                                >
                                    {t(
                                        "HOSTED_MANAGE_OPEN_BILLING_I18N.string",
                                    )}
                                </Text>
                            </Pressable>
                        ) : null}
                        <Pressable
                            onPress={() => {
                                signOutMutation.mutate();
                            }}
                            disabled={
                                actionPending ||
                                state.authPhase === "signed_out"
                            }
                        >
                            <Text
                                style={[
                                    ss.tinyFont,
                                    ss.blackText,
                                    {
                                        textDecorationLine: "underline",
                                        opacity:
                                            actionPending ||
                                            state.authPhase === "signed_out"
                                                ? 0.4
                                                : 0.7,
                                    },
                                ]}
                            >
                                {t("SIGN_OUT_I18N.string")}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            ) : null}
        </View>
    );
}

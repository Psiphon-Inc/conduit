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

type AccountActionVariant = "primary" | "secondary" | "danger";

export function HostedConduitSettingsCard() {
    const { t } = useTranslation();
    const router = useRouter();
    const state = useHostedExperienceState();
    const actions = useHostedExperienceActions();
    const hostedConfig = React.useMemo(readHostedRuntimeConfig, []);

    const [expanded, setExpanded] = React.useState(false);
    const [actionError, setActionError] = React.useState<string | null>(null);
    const [actionNotice, setActionNotice] = React.useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = React.useState(false);

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
            setActionNotice(null);
            setConfirmDelete(false);
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
            setActionNotice(null);
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
            setActionNotice(null);
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });
    const restorePurchasesMutation = useMutation({
        mutationFn: async () => {
            await actions.restorePurchases();
        },
        onMutate: () => {
            setActionError(null);
            setActionNotice(null);
        },
        onSuccess: () => {
            setActionNotice(
                t("PURCHASES_RESTORED_I18N.string", {
                    defaultValue: "Purchases restored.",
                }),
            );
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });
    const deleteAccountMutation = useMutation({
        mutationFn: async () => {
            await actions.deleteAccount();
        },
        onMutate: () => {
            setActionError(null);
            setActionNotice(null);
        },
        onSuccess: () => {
            setConfirmDelete(false);
            setExpanded(false);
            setActionNotice(
                t("ACCOUNT_DELETED_I18N.string", {
                    defaultValue: "Account deleted.",
                }),
            );
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });
    const effectiveStatus = subscriptionStatus;
    const isExpired =
        effectiveStatus === "expired" || effectiveStatus === "inactive";
    const showRenew = effectiveStatus === "canceled_not_expired";
    const isEntitlementLinked =
        effectiveStatus === "active" ||
        effectiveStatus === "grace" ||
        effectiveStatus === "canceled_not_expired";
    const showRestorePurchases = !isEntitlementLinked;

    const actionPending =
        signOutMutation.isPending ||
        resetHcbStateMutation.isPending ||
        renewMutation.isPending ||
        restorePurchasesMutation.isPending ||
        deleteAccountMutation.isPending;

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

    function renderAccountAction({
        label,
        onPress,
        disabled = false,
        pending = false,
        variant = "secondary",
    }: {
        label: string;
        onPress: () => void;
        disabled?: boolean;
        pending?: boolean;
        variant?: AccountActionVariant;
    }) {
        const isDanger = variant === "danger";
        const isPrimary = variant === "primary";
        const borderColor = isDanger ? palette.red : palette.purple;
        const backgroundColor = disabled
            ? isDanger
                ? palette.redTint5
                : palette.fadedMauve
            : isPrimary
              ? palette.purpleTint3
              : palette.white;
        const textColor = isDanger ? palette.red : palette.black;

        return (
            <Pressable
                onPress={onPress}
                disabled={disabled}
                style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 12,
                    minHeight: 44,
                    paddingHorizontal: 14,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor,
                    opacity: disabled ? 0.65 : 1,
                }}
            >
                {pending ? (
                    <ActivityIndicator size="small" color={textColor} />
                ) : (
                    <Text
                        style={[
                            ss.bodyFont,
                            ss.centeredText,
                            { color: textColor, fontSize: 14 },
                        ]}
                    >
                        {label}
                    </Text>
                )}
            </Pressable>
        );
    }

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

            {actionNotice ? (
                <Text
                    style={[
                        ss.tinyFont,
                        ss.blackText,
                        { opacity: 0.7, paddingTop: 4 },
                    ]}
                >
                    {actionNotice}
                </Text>
            ) : null}

            {actionError ? (
                <Text
                    style={[ss.tinyFont, { color: palette.red, paddingTop: 4 }]}
                >
                    {actionError}
                </Text>
            ) : null}

            {!isSignedOut && expanded ? (
                <View
                    style={{
                        backgroundColor: "rgba(255, 255, 255, 0.42)",
                        borderWidth: 1,
                        borderColor: palette.thinPurple,
                        borderRadius: 16,
                        padding: 12,
                        marginTop: 8,
                        gap: 12,
                    }}
                >
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
                                    {
                                        fontSize: 11,
                                        fontFamily: "JuraRegular",
                                    },
                                ]}
                            >
                                {state.session?.accountId ?? "\u2014"}
                            </Text>
                        </View>
                    </View>

                    <View
                        style={{
                            gap: 8,
                        }}
                    >
                        {showRenew
                            ? renderAccountAction({
                                  label: t("RENEW_SUBSCRIPTION_I18N.string"),
                                  onPress: () => {
                                      renewMutation.mutate();
                                  },
                                  disabled: actionPending,
                                  pending: renewMutation.isPending,
                                  variant: "primary",
                              })
                            : null}
                        {manageBillingUrl
                            ? renderAccountAction({
                                  label: t(
                                      "HOSTED_MANAGE_OPEN_BILLING_I18N.string",
                                  ),
                                  onPress: () => {
                                      void Linking.openURL(
                                          manageBillingUrl,
                                      ).catch((error) => {
                                          setActionError(toErrorString(error));
                                      });
                                  },
                                  disabled: actionPending,
                              })
                            : null}
                        {showRestorePurchases
                            ? renderAccountAction({
                                  label: t("RESTORE_PURCHASES_I18N.string", {
                                      defaultValue: "Restore Purchases",
                                  }),
                                  onPress: () => {
                                      restorePurchasesMutation.mutate();
                                  },
                                  disabled: actionPending,
                                  pending: restorePurchasesMutation.isPending,
                              })
                            : null}
                        {renderAccountAction({
                            label: t("SIGN_OUT_I18N.string"),
                            onPress: () => {
                                signOutMutation.mutate();
                            },
                            disabled:
                                actionPending ||
                                state.authPhase === "signed_out",
                            pending: signOutMutation.isPending,
                        })}
                    </View>

                    <View style={{ gap: 8 }}>
                        {confirmDelete ? (
                            <View
                                style={{
                                    borderWidth: 1,
                                    borderColor: palette.red,
                                    borderRadius: 10,
                                    padding: 10,
                                    gap: 10,
                                    backgroundColor: palette.redTint5,
                                }}
                            >
                                <Text style={[ss.tinyFont, ss.blackText]}>
                                    {t(
                                        "DELETE_ACCOUNT_CONFIRMATION_I18N.string",
                                        {
                                            defaultValue:
                                                "This deletes your Hosted Conduit account from this app and signs you out.",
                                        },
                                    )}
                                </Text>
                                {renderAccountAction({
                                    label: t(
                                        "DELETE_ACCOUNT_CONFIRM_BUTTON_I18N.string",
                                        {
                                            defaultValue: "Delete account",
                                        },
                                    ),
                                    onPress: () => {
                                        deleteAccountMutation.mutate();
                                    },
                                    disabled: actionPending,
                                    pending: deleteAccountMutation.isPending,
                                    variant: "danger",
                                })}
                                {renderAccountAction({
                                    label: t("CANCEL_I18N.string"),
                                    onPress: () => setConfirmDelete(false),
                                    disabled: actionPending,
                                })}
                            </View>
                        ) : (
                            renderAccountAction({
                                label: t("DELETE_ACCOUNT_I18N.string", {
                                    defaultValue: "Delete account",
                                }),
                                onPress: () => setConfirmDelete(true),
                                disabled: actionPending,
                                variant: "danger",
                            })
                        )}
                    </View>
                </View>
            ) : null}
        </View>
    );
}

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
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Platform,
    Pressable,
    Text,
    View,
} from "react-native";

import { toErrorString } from "@/src/common/errors";
import { readOptionalStringField } from "@/src/common/recordUtils";
import { Icon } from "@/src/components/Icon";
import { createHostedApiClient } from "@/src/hosted/apiClient";
import {
    resolveHttpsUrl,
    resolveManageBillingUrl,
} from "@/src/hosted/billingUtils";
import { readHostedRuntimeConfig } from "@/src/hosted/config";
import {
    useHostedExperienceActions,
    useHostedExperienceState,
} from "@/src/hosted/experience/hooks";
import { useRevenueCatContext } from "@/src/hosted/revenuecatContext";
import { HostedCustomerInfo } from "@/src/hosted/revenuecatTypes";
import { palette, sharedStyles as ss } from "@/src/styles";

const ACCOUNT_HORIZONTAL_PADDING = 32;
const ACCOUNT_ACTIVE_GREEN = "#16954E";
const ACCOUNT_RENEWS_ORANGE = "#FD6E02";
const ACCOUNT_DANGER_RED = "#EE262B";
const EXPIRING_SOON_WINDOW_MS = 1000 * 60 * 60 * 24 * 14;

type AccountActionVariant = "primary" | "secondary" | "danger";
type SubscriptionChipKind = "active" | "renews" | "expires-soon" | "expired";
type ExpoImageSource = React.ComponentProps<typeof ExpoImage>["source"];

const SUBSCRIPTION_ICON = require("@/assets/images/icons/subscription.png");
const SUBSCRIPTION_ACTIVE_ICON = require("@/assets/images/icons/subscription-active.svg");
const SUBSCRIPTION_RENEWS_ICON = require("@/assets/images/icons/subscription-renews.svg");
const SUBSCRIPTION_EXPIRED_ICON = require("@/assets/images/icons/subscription-expired.svg");
const SIGN_OUT_ICON = require("@/assets/images/icons/sign-out.svg");
const DELETE_ACCOUNT_ICON = require("@/assets/images/icons/delete-account.svg");
const WEB_SUBSCRIPTION_DELETE_CLEANUP_MESSAGE =
    "Cancel your web subscription before deleting your account. After cancellation is reflected here, retry delete account.";

export function HostedConduitAccountPage() {
    const { t } = useTranslation();
    const router = useRouter();
    const state = useHostedExperienceState();
    const actions = useHostedExperienceActions();
    const revenueCat = useRevenueCatContext();
    const hostedConfig = React.useMemo(readHostedRuntimeConfig, []);
    const hostedClient = React.useMemo(
        () => createHostedApiClient({ baseUrl: hostedConfig.baseUrl }),
        [hostedConfig.baseUrl],
    );

    const [subscriptionExpanded, setSubscriptionExpanded] =
        React.useState(false);
    const [actionError, setActionError] = React.useState<string | null>(null);
    const [actionNotice, setActionNotice] = React.useState<string | null>(null);
    const [subscriptionRefreshSuggested, setSubscriptionRefreshSuggested] =
        React.useState(false);
    const [confirmDelete, setConfirmDelete] = React.useState(false);

    const entitlementSnapshot =
        (state.conduitsSnapshot?.entitlement as Record<string, unknown>) ??
        null;
    const manageBillingUrl = React.useMemo(
        () =>
            resolveManageBillingUrl(
                hostedConfig.baseUrl,
                entitlementSnapshot,
            ) ??
            resolveHttpsUrl(revenueCat.customerInfo?.managementUrl) ??
            null,
        [
            entitlementSnapshot,
            hostedConfig.baseUrl,
            revenueCat.customerInfo?.managementUrl,
        ],
    );
    const subscriptionStatus =
        readOptionalStringField(entitlementSnapshot, "status") ??
        state.entitlementSnapshot;
    const expiresAt = readOptionalStringField(
        entitlementSnapshot,
        "expires_at",
    );
    const productId = readOptionalStringField(
        entitlementSnapshot,
        "product_id",
    );
    const effectiveStatus = subscriptionStatus;
    const revenueCatHasRenewingEntitlement = hasRenewingRevenueCatEntitlement(
        revenueCat.customerInfo,
    );
    const webSubscriptionRequiresCleanup =
        Platform.OS === "web" &&
        (effectiveStatus === "active" ||
            effectiveStatus === "grace" ||
            revenueCatHasRenewingEntitlement);

    const openBillingPortal = React.useCallback(async () => {
        const session = await actions.refreshSessionIfNeeded();
        const response = await hostedClient.createBillingPortalSession(
            session.accessToken,
        );
        await Linking.openURL(response.url);
    }, [actions, hostedClient]);

    const signOutMutation = useMutation({
        mutationFn: async () => {
            await actions.signOut();
        },
        onMutate: () => {
            setActionError(null);
            setActionNotice(null);
            setSubscriptionRefreshSuggested(false);
            setConfirmDelete(false);
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });

    const renewMutation = useMutation({
        mutationFn: async () => {
            if (
                Platform.OS === "web" &&
                effectiveStatus === "canceled_not_expired"
            ) {
                await openBillingPortal();
                return true;
            }

            router.push({
                pathname: "/(app)/hosted-setup",
                params: { intent: "renew" },
            });
            return false;
        },
        onMutate: () => {
            setActionError(null);
            setActionNotice(null);
            setSubscriptionRefreshSuggested(false);
        },
        onSuccess: (openedBillingPortal) => {
            if (!openedBillingPortal) {
                return;
            }

            setSubscriptionRefreshSuggested(true);
            setActionNotice(t("RENEW_SUBSCRIPTION_PORTAL_OPENED_I18N.string"));
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
            setSubscriptionRefreshSuggested(false);
        },
        onSuccess: () => {
            setActionNotice(t("PURCHASES_RESTORED_I18N.string"));
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });

    const cancelSubscriptionMutation = useMutation({
        mutationFn: async () => {
            await openBillingPortal();
        },
        onMutate: () => {
            setActionError(null);
            setActionNotice(null);
            setConfirmDelete(false);
            setSubscriptionRefreshSuggested(false);
        },
        onSuccess: () => {
            setSubscriptionRefreshSuggested(true);
            setActionNotice(t("CANCEL_SUBSCRIPTION_PORTAL_OPENED_I18N.string"));
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });

    const refreshSubscriptionMutation = useMutation({
        mutationFn: async () => {
            await revenueCat.refreshCustomerInfo();
            await actions.pollConduitsOnce();
        },
        onMutate: () => {
            setActionError(null);
            setActionNotice(null);
        },
        onSuccess: () => {
            setSubscriptionRefreshSuggested(false);
            setActionNotice(t("SUBSCRIPTION_STATUS_REFRESHED_I18N.string"));
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });

    const deleteAccountMutation = useMutation({
        mutationFn: async () => {
            if (await shouldBlockWebAccountDeletion()) {
                await openBillingPortal();
                throw new Error(WEB_SUBSCRIPTION_DELETE_CLEANUP_MESSAGE);
            }
            await actions.deleteAccount();
        },
        onMutate: () => {
            setActionError(null);
            setActionNotice(null);
            setSubscriptionRefreshSuggested(false);
        },
        onSuccess: () => {
            setConfirmDelete(false);
            setSubscriptionExpanded(false);
            setActionNotice(t("ACCOUNT_DELETED_I18N.string"));
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });

    const isSignedOut = state.authPhase === "signed_out";
    const showRenew = effectiveStatus === "canceled_not_expired";
    const isEntitlementLinked =
        effectiveStatus === "active" ||
        effectiveStatus === "grace" ||
        effectiveStatus === "canceled_not_expired";
    const showRestorePurchases = !isEntitlementLinked;
    const actionPending =
        signOutMutation.isPending ||
        renewMutation.isPending ||
        restorePurchasesMutation.isPending ||
        cancelSubscriptionMutation.isPending ||
        refreshSubscriptionMutation.isPending ||
        deleteAccountMutation.isPending;
    const subscriptionPresentation = resolveSubscriptionPresentation({
        status: effectiveStatus,
        expiresAt,
        productId,
        t,
    });

    function goBack() {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace("/(app)/settings");
    }

    function onConfirmDeletePress() {
        if (!webSubscriptionRequiresCleanup) {
            deleteAccountMutation.mutate();
            return;
        }

        cancelSubscriptionMutation.mutate();
    }

    async function shouldBlockWebAccountDeletion(): Promise<boolean> {
        if (Platform.OS !== "web") {
            return false;
        }

        const customerInfo = await revenueCat.refreshCustomerInfo();
        return (
            effectiveStatus === "active" ||
            effectiveStatus === "grace" ||
            hasRenewingRevenueCatEntitlement(customerInfo)
        );
    }

    return (
        <View
            style={{
                flex: 1,
                paddingHorizontal: ACCOUNT_HORIZONTAL_PADDING,
                paddingTop: 22,
            }}
        >
            <Pressable
                onPress={goBack}
                hitSlop={12}
                style={{
                    width: 44,
                    height: 44,
                    justifyContent: "center",
                    marginLeft: -12,
                }}
            >
                <View
                    style={{
                        width: 14,
                        height: 14,
                        borderLeftWidth: 2,
                        borderBottomWidth: 2,
                        borderColor: palette.purple,
                        transform: [{ rotate: "45deg" }],
                    }}
                />
            </Pressable>

            <Text
                style={[
                    ss.blackText,
                    ss.extraLargeFont,
                    { fontFamily: "JuraRegular", marginTop: 12 },
                ]}
            >
                {t("ACCOUNT_I18N.string")}
            </Text>

            <View style={{ marginTop: 48 }}>
                {isSignedOut ? (
                    <AccountActionRow
                        iconSource={SIGN_OUT_ICON}
                        label={t("SIGN_IN_I18N.string")}
                        onPress={() => router.push("/(app)/hosted-setup")}
                    />
                ) : (
                    <>
                        <SubscriptionRow
                            presentation={subscriptionPresentation}
                            expanded={subscriptionExpanded}
                            onPress={() =>
                                setSubscriptionExpanded((value) => !value)
                            }
                        />

                        {subscriptionExpanded ? (
                            <View
                                style={{
                                    borderWidth: 1,
                                    borderColor: palette.thinPurple,
                                    borderRadius: 16,
                                    backgroundColor:
                                        "rgba(255, 255, 255, 0.42)",
                                    padding: 12,
                                    marginBottom: 18,
                                    gap: 10,
                                }}
                            >
                                {expiresAt ? (
                                    <DetailRow
                                        label={t("RENEWS_EXPIRES_I18N.string")}
                                        value={formatSubscriptionDate(
                                            expiresAt,
                                        )}
                                    />
                                ) : null}
                                {state.session?.accountId ? (
                                    <DetailRow
                                        label={t("ACCOUNT_I18N.string")}
                                        value={state.session.accountId}
                                    />
                                ) : null}
                                {showRenew ? (
                                    <AccountPanelButton
                                        label={t(
                                            "RENEW_SUBSCRIPTION_I18N.string",
                                        )}
                                        onPress={() => renewMutation.mutate()}
                                        disabled={actionPending}
                                        pending={renewMutation.isPending}
                                        variant="primary"
                                    />
                                ) : null}
                                {webSubscriptionRequiresCleanup ? (
                                    <AccountPanelButton
                                        label={t(
                                            "CANCEL_SUBSCRIPTION_I18N.string",
                                        )}
                                        onPress={() =>
                                            cancelSubscriptionMutation.mutate()
                                        }
                                        disabled={actionPending}
                                        pending={
                                            cancelSubscriptionMutation.isPending
                                        }
                                        variant="danger"
                                    />
                                ) : null}
                                {subscriptionRefreshSuggested ? (
                                    <AccountPanelButton
                                        label={t(
                                            "REFRESH_SUBSCRIPTION_STATUS_I18N.string",
                                        )}
                                        onPress={() =>
                                            refreshSubscriptionMutation.mutate()
                                        }
                                        disabled={actionPending}
                                        pending={
                                            refreshSubscriptionMutation.isPending
                                        }
                                        variant="secondary"
                                    />
                                ) : null}
                                {manageBillingUrl ? (
                                    <AccountPanelButton
                                        testID="account-manage"
                                        label={t(
                                            "HOSTED_MANAGE_OPEN_BILLING_I18N.string",
                                        )}
                                        onPress={() => {
                                            void Linking.openURL(
                                                manageBillingUrl,
                                            ).catch((error) => {
                                                setActionError(
                                                    toErrorString(error),
                                                );
                                            });
                                        }}
                                        disabled={actionPending}
                                        variant="secondary"
                                    />
                                ) : null}
                                {showRestorePurchases ? (
                                    <AccountPanelButton
                                        testID="account-restore"
                                        label={t(
                                            "RESTORE_PURCHASES_I18N.string",
                                        )}
                                        onPress={() =>
                                            restorePurchasesMutation.mutate()
                                        }
                                        disabled={actionPending}
                                        pending={
                                            restorePurchasesMutation.isPending
                                        }
                                        variant="secondary"
                                    />
                                ) : null}
                            </View>
                        ) : null}

                        <Divider />

                        <AccountActionRow
                            iconSource={SIGN_OUT_ICON}
                            label={t("SIGN_OUT_I18N.string")}
                            onPress={() => signOutMutation.mutate()}
                            disabled={actionPending}
                            pending={signOutMutation.isPending}
                            testID="account-signout"
                        />

                        <Divider />

                        <AccountActionRow
                            iconSource={DELETE_ACCOUNT_ICON}
                            label={t("DELETE_ACCOUNT_I18N.string")}
                            onPress={() => setConfirmDelete(true)}
                            disabled={actionPending}
                            danger={true}
                            showChevron={false}
                            testID="account-delete"
                        />

                        {confirmDelete ? (
                            <View
                                style={{
                                    borderWidth: 1,
                                    borderColor: ACCOUNT_DANGER_RED,
                                    borderRadius: 12,
                                    padding: 12,
                                    gap: 10,
                                    backgroundColor: palette.redTint5,
                                    marginTop: 4,
                                }}
                            >
                                <Text
                                    style={[
                                        ss.bodyFont,
                                        ss.blackText,
                                        { fontSize: 18, lineHeight: 24 },
                                    ]}
                                >
                                    {t(
                                        "DELETE_ACCOUNT_CONFIRMATION_I18N.string",
                                    )}
                                </Text>
                                {webSubscriptionRequiresCleanup ? (
                                    <Text
                                        style={[
                                            ss.tinyFont,
                                            {
                                                color: ACCOUNT_DANGER_RED,
                                                lineHeight: 20,
                                            },
                                        ]}
                                    >
                                        Cancel your web subscription before
                                        deleting your account so billing does
                                        not continue after account deletion.
                                    </Text>
                                ) : null}
                                <AccountPanelButton
                                    testID="account-delete-confirm"
                                    label={
                                        webSubscriptionRequiresCleanup
                                            ? t(
                                                  "CANCEL_SUBSCRIPTION_I18N.string",
                                              )
                                            : t(
                                                  "DELETE_ACCOUNT_CONFIRM_BUTTON_I18N.string",
                                              )
                                    }
                                    onPress={onConfirmDeletePress}
                                    disabled={actionPending}
                                    pending={
                                        webSubscriptionRequiresCleanup
                                            ? cancelSubscriptionMutation.isPending
                                            : deleteAccountMutation.isPending
                                    }
                                    variant="danger"
                                />
                                <AccountPanelButton
                                    label={t("CANCEL_I18N.string")}
                                    onPress={() => setConfirmDelete(false)}
                                    disabled={actionPending}
                                    variant="secondary"
                                />
                            </View>
                        ) : null}
                    </>
                )}

                {actionNotice ? (
                    <Text
                        style={[
                            ss.tinyFont,
                            ss.blackText,
                            { opacity: 0.7, paddingTop: 14 },
                        ]}
                    >
                        {actionNotice}
                    </Text>
                ) : null}

                {actionError ? (
                    <Text
                        style={[
                            ss.tinyFont,
                            { color: ACCOUNT_DANGER_RED, paddingTop: 14 },
                        ]}
                    >
                        {actionError}
                    </Text>
                ) : null}
            </View>
        </View>
    );
}

function SubscriptionRow({
    presentation,
    expanded,
    onPress,
}: {
    presentation: SubscriptionPresentation;
    expanded: boolean;
    onPress: () => void;
}) {
    const { t } = useTranslation();

    return (
        <Pressable
            onPress={onPress}
            style={{
                minHeight: 82,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 18,
                paddingVertical: 10,
            }}
        >
            <ExpoImage
                source={SUBSCRIPTION_ICON}
                tintColor={palette.black}
                style={{ width: 34, height: 34 }}
                contentFit="contain"
            />
            <View style={{ flex: 1, gap: 7 }}>
                <Text style={[ss.bodyFont, ss.blackText, { fontSize: 18 }]}>
                    {t("ACCOUNT_SUBSCRIPTION_I18N.string")}
                </Text>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                    }}
                >
                    <SubscriptionChip presentation={presentation} />
                    {presentation.intervalLabel ? (
                        <Text
                            style={[
                                ss.tinyFont,
                                ss.blackText,
                                { opacity: 0.46, fontSize: 13 },
                            ]}
                        >
                            {presentation.intervalLabel}
                        </Text>
                    ) : null}
                </View>
                {presentation.detail ? (
                    <Text
                        style={[
                            ss.tinyFont,
                            ss.blackText,
                            { opacity: 0.46, fontSize: 13 },
                        ]}
                    >
                        {presentation.detail}
                    </Text>
                ) : null}
            </View>
            <View
                style={{
                    transform: [{ rotate: expanded ? "90deg" : "0deg" }],
                }}
            >
                <Icon name="chevron-right" color={palette.black} size={18} />
            </View>
        </Pressable>
    );
}

function AccountActionRow({
    iconSource,
    label,
    onPress,
    disabled = false,
    pending = false,
    danger = false,
    showChevron = true,
    testID,
}: {
    iconSource: ExpoImageSource;
    label: string;
    onPress: () => void;
    disabled?: boolean;
    pending?: boolean;
    danger?: boolean;
    showChevron?: boolean;
    testID?: string;
}) {
    const color = danger ? ACCOUNT_DANGER_RED : palette.black;

    return (
        <Pressable
            testID={testID}
            onPress={onPress}
            disabled={disabled}
            style={{
                minHeight: 92,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 18,
                opacity: disabled ? 0.55 : 1,
            }}
        >
            <ExpoImage
                source={iconSource}
                tintColor={color}
                style={{ width: 30, height: 30 }}
                contentFit="contain"
            />
            <Text style={[ss.bodyFont, { color, flex: 1, fontSize: 18 }]}>
                {label}
            </Text>
            {pending ? (
                <ActivityIndicator size="small" color={color} />
            ) : showChevron ? (
                <Icon name="chevron-right" color={color} size={18} />
            ) : null}
        </Pressable>
    );
}

function SubscriptionChip({
    presentation,
}: {
    presentation: SubscriptionPresentation;
}) {
    const colors = resolveChipColors(presentation.kind);

    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "flex-start",
                gap: 6,
                borderWidth: 1,
                borderColor: colors.borderColor,
                borderRadius: 100,
                paddingHorizontal: 10,
                paddingVertical: 5,
                backgroundColor: colors.backgroundColor,
            }}
        >
            <ExpoImage
                source={presentation.iconSource}
                tintColor={colors.textColor}
                style={{ width: 15, height: 15 }}
                contentFit="contain"
            />
            <Text
                style={[ss.tinyFont, { color: colors.textColor, fontSize: 13 }]}
            >
                {presentation.chipLabel}
            </Text>
        </View>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <View
            style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
            }}
        >
            <Text style={[ss.tinyFont, ss.blackText, { opacity: 0.56 }]}>
                {label}
            </Text>
            <Text
                numberOfLines={1}
                style={[
                    ss.tinyFont,
                    ss.blackText,
                    { flexShrink: 1, textAlign: "right" },
                ]}
            >
                {value}
            </Text>
        </View>
    );
}

function AccountPanelButton({
    label,
    onPress,
    disabled = false,
    pending = false,
    variant = "secondary",
    testID,
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    pending?: boolean;
    variant?: AccountActionVariant;
    testID?: string;
}) {
    const isDanger = variant === "danger";
    const isPrimary = variant === "primary";
    const borderColor = isDanger ? ACCOUNT_DANGER_RED : palette.purple;
    const backgroundColor = disabled
        ? isDanger
            ? palette.redTint5
            : palette.fadedMauve
        : isPrimary
          ? palette.purple
          : palette.white;
    const textColor = isDanger
        ? ACCOUNT_DANGER_RED
        : isPrimary
          ? palette.white
          : palette.black;

    return (
        <Pressable
            testID={testID}
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

function Divider() {
    return (
        <View
            style={{
                height: 1,
                backgroundColor: "rgba(0, 0, 0, 0.08)",
            }}
        />
    );
}

function hasRenewingRevenueCatEntitlement(
    customerInfo: HostedCustomerInfo | null,
): boolean {
    return Object.values(customerInfo?.entitlements.active ?? {}).some(
        (entitlement) => entitlement.isActive && entitlement.willRenew,
    );
}

type SubscriptionPresentation = {
    kind: SubscriptionChipKind;
    iconSource: ExpoImageSource;
    chipLabel: string;
    intervalLabel: string | null;
    detail: string | null;
};

function resolveSubscriptionPresentation({
    status,
    expiresAt,
    productId,
    t,
}: {
    status: string | null | undefined;
    expiresAt: string | null;
    productId: string | null;
    t: ReturnType<typeof useTranslation>["t"];
}): SubscriptionPresentation {
    const expiresAtMs = expiresAt ? Date.parse(expiresAt) : NaN;
    const hasValidExpiry = Number.isFinite(expiresAtMs);
    const expiresSoon =
        hasValidExpiry &&
        expiresAtMs > Date.now() &&
        expiresAtMs - Date.now() <= EXPIRING_SOON_WINDOW_MS;
    const formattedDate = expiresAt ? formatSubscriptionDate(expiresAt) : "";
    const intervalLabel = resolveSubscriptionInterval(productId, t);

    if (status === "active" || status === "grace") {
        if (expiresSoon && formattedDate) {
            return {
                kind: "renews",
                iconSource: SUBSCRIPTION_RENEWS_ICON,
                chipLabel: t("ACCOUNT_RENEWS_DATE_I18N.string", {
                    date: formattedDate,
                }),
                intervalLabel,
                detail: null,
            };
        }
        return {
            kind: "active",
            iconSource: SUBSCRIPTION_ACTIVE_ICON,
            chipLabel: t("ACCOUNT_STATUS_ACTIVE_I18N.string"),
            intervalLabel,
            detail: formattedDate
                ? t("ACCOUNT_RENEWS_ON_I18N.string", {
                      date: formattedDate,
                  })
                : null,
        };
    }

    if (status === "canceled_not_expired") {
        return {
            kind: "expires-soon",
            iconSource: SUBSCRIPTION_EXPIRED_ICON,
            chipLabel: t("ACCOUNT_STATUS_EXPIRES_SOON_I18N.string"),
            intervalLabel,
            detail: formattedDate
                ? t("ACCOUNT_EXPIRES_ON_I18N.string", {
                      date: formattedDate,
                  })
                : null,
        };
    }

    return {
        kind: "expired",
        iconSource: SUBSCRIPTION_EXPIRED_ICON,
        chipLabel: t("ACCOUNT_STATUS_EXPIRED_I18N.string"),
        intervalLabel,
        detail: null,
    };
}

function resolveChipColors(kind: SubscriptionChipKind) {
    if (kind === "active") {
        return {
            borderColor: "rgba(22, 149, 78, 0.54)",
            backgroundColor: "rgba(22, 149, 78, 0.12)",
            textColor: ACCOUNT_ACTIVE_GREEN,
        };
    }
    if (kind === "renews") {
        return {
            borderColor: "rgba(253, 110, 2, 0.54)",
            backgroundColor: "rgba(253, 110, 2, 0.12)",
            textColor: ACCOUNT_RENEWS_ORANGE,
        };
    }
    return {
        borderColor: "rgba(0, 0, 0, 0.46)",
        backgroundColor: "rgba(0, 0, 0, 0.12)",
        textColor: palette.black,
    };
}

function resolveSubscriptionInterval(
    productId: string | null,
    t: ReturnType<typeof useTranslation>["t"],
) {
    const normalized = productId?.toLowerCase() ?? "";
    if (!normalized) {
        return null;
    }
    if (/year|annual|12month/.test(normalized)) {
        return t("ACCOUNT_PLAN_YEARLY_I18N.string");
    }
    if (/month|monthly|1month/.test(normalized)) {
        return t("ACCOUNT_PLAN_MONTHLY_I18N.string");
    }
    return null;
}

function formatSubscriptionDate(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return iso;
    }
    return date.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

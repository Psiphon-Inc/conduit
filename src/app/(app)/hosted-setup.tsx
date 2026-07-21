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
import { useMutation, useQuery } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import * as Linking from "expo-linking";
import * as Network from "expo-network";
import {
    useLocalSearchParams,
    useRootNavigationState,
    useRouter,
} from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
    useWindowDimensions,
} from "react-native";

import { toErrorString } from "@/src/common/errors";
import { formatExpiresAt } from "@/src/common/formatters";
import { timedLog } from "@/src/common/utils";
import {
    ActionButton,
    HostedPlanSelection,
    HostedSetupBackButton,
    PrimaryActionBlock,
    StatusText,
} from "@/src/components/HostedSetupSections";
import { HostedSetupSignInHero } from "@/src/components/HostedSetupSignInHero";
import { ProxyID } from "@/src/components/ProxyID";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { APP_MAX_CONTENT_WIDTH } from "@/src/constants";
import { createHostedApiClient } from "@/src/hosted/apiClient";
import { readHostedClerkPublishableKey } from "@/src/hosted/auth/clerk";
import {
    formatConduitScope,
    orderedConduitsForDisplay,
} from "@/src/hosted/conduitDisplay";
import { readHostedRuntimeConfig } from "@/src/hosted/config";
import { OAuthProvider } from "@/src/hosted/contracts";
import {
    useHostedExperienceActions,
    useHostedExperienceInitialSessionResolved,
    useHostedExperienceLastAuthProvider,
    useHostedExperienceRevenueCatNativeActionPending,
    useHostedExperienceState,
} from "@/src/hosted/experience/hooks";
import { shouldRouteToHostedActiveExperience } from "@/src/hosted/experience/navigation";
import { createHostedOnboardingViewModel } from "@/src/hosted/experience/onboarding";
import { useHostedPlanOptionsQuery } from "@/src/hosted/planCatalogQueries";
import {
    HostedPlanOption,
    HostedPlanSelectionDescriptor,
    isCancelledPurchaseError,
    normalizeStatusText,
    resolveFirstHostedPackage,
    resolveHostedSelectedPlanOption,
} from "@/src/hosted/planUtils";
import { resolveRevenueCatApiKey } from "@/src/hosted/revenuecatClient";
import { useRevenueCatContext } from "@/src/hosted/revenuecatContext";
import { palette, sharedStyles as ss } from "@/src/styles";
import { recordVisibleClientError } from "@/src/telemetry/clientEvents";

const NO_NETWORK_ICON = require("@/assets/images/icons/no-network.svg");

export default function HostedSetupScreen() {
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const rootNavigationState = useRootNavigationState();
    const { intent } = useLocalSearchParams<{ intent?: string }>();
    const isRenewIntent = intent === "renew";
    const config = React.useMemo(readHostedRuntimeConfig, []);
    const clerkPublishableKey = React.useMemo(
        readHostedClerkPublishableKey,
        [],
    );
    const state = useHostedExperienceState();
    const initialSessionResolved = useHostedExperienceInitialSessionResolved();
    const revenueCatNativeActionPending =
        useHostedExperienceRevenueCatNativeActionPending();
    const lastAuthProvider = useHostedExperienceLastAuthProvider();
    const actions = useHostedExperienceActions();
    const revenueCat = useRevenueCatContext();
    const hostedClient = React.useMemo(
        () => createHostedApiClient({ baseUrl: config.baseUrl }),
        [config.baseUrl],
    );
    const window = useWindowDimensions();
    const networkState = Network.useNetworkState();
    const isOffline =
        networkState.isConnected === false ||
        networkState.isInternetReachable === false;
    const webRenewUsesBillingPortal =
        Platform.OS === "web" &&
        isRenewIntent &&
        state.entitlementSnapshot === "canceled_not_expired";

    const [actionError, setActionError] = React.useState<string | null>(null);
    const [actionNotice, setActionNotice] = React.useState<string | null>(null);
    const [selectedPlanKey, setSelectedPlanKey] = React.useState<string | null>(
        null,
    );
    const [selectedPlanDescriptor, setSelectedPlanDescriptor] =
        React.useState<HostedPlanSelectionDescriptor | null>(null);

    function goBackFromHostedSetup() {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace("/(app)");
    }

    const canContinue = shouldRouteToHostedActiveExperience(state);
    const onboarding = React.useMemo(
        () =>
            createHostedOnboardingViewModel(state, {
                hasRecentSignIn: lastAuthProvider != null,
                isOffline,
                t,
            }),
        [isOffline, lastAuthProvider, state, t],
    );
    const conduits = state.conduitsSnapshot?.conduits ?? [];
    const attentionLogSignatureRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        // In renewal mode the user already has an allowed entitlement, so
        // canContinue is true on mount.  Skip the auto-redirect and let them
        // pick a plan; we redirect after a successful purchase instead.
        if (!rootNavigationState?.key || !canContinue || isRenewIntent) {
            return;
        }
        router.replace("/(app)");
    }, [canContinue, isRenewIntent, rootNavigationState?.key, router]);

    React.useEffect(() => {
        if (onboarding.primaryAction !== "restore_or_manage") {
            attentionLogSignatureRef.current = null;
            return;
        }

        const reasons = listRestoreOrManageReasons(state);
        const signature = JSON.stringify({
            reasons,
            entitlement: state.entitlementSnapshot,
            entitlementProductId:
                state.conduitsSnapshot?.entitlement?.product_id ?? null,
            entitlementExpiresAt:
                state.conduitsSnapshot?.entitlement?.expires_at ?? null,
            stationPhase: state.stationPhase,
            stationError: state.stationError,
            pollingError: state.polling.lastError,
            revenuecatError: state.revenuecatError,
            conduits: conduits.map((conduit) => ({
                id: conduit.conduit_id,
                status: conduit.status,
                scope: conduit.traffic_scope ?? "unknown",
            })),
        });

        if (attentionLogSignatureRef.current === signature) {
            return;
        }
        attentionLogSignatureRef.current = signature;

        timedLog(
            `Hosted setup in restore_or_manage: reasons=[${
                reasons.join(",") || "unspecified"
            }] entitlement=${state.entitlementSnapshot} station=${
                state.stationPhase
            } product=${
                state.conduitsSnapshot?.entitlement?.product_id ?? "none"
            } entitlementExpiresAt=${
                state.conduitsSnapshot?.entitlement?.expires_at ?? "none"
            } stationError=${state.stationError ?? "none"} pollingError=${
                state.polling.lastError ?? "none"
            } revenuecatError=${state.revenuecatError ?? "none"}`,
        );
    }, [
        conduits,
        onboarding.primaryAction,
        state.entitlementSnapshot,
        state.polling.lastError,
        state.revenuecatError,
        state.stationError,
        state.stationPhase,
    ]);

    const bootstrapConduitsQuery = useQuery({
        queryKey: ["hosted", "bootstrap-conduits", state.session?.accountId],
        enabled:
            state.authPhase === "authenticated" &&
            Boolean(state.session) &&
            !isOffline,
        queryFn: async () => {
            await actions.pollConduitsOnce();
            return true;
        },
        staleTime: Infinity,
        retry: 3,
        retryDelay: 5_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchInterval: (query) => (query.state.error ? 10_000 : false),
    });

    const activatePlansQuery = useHostedPlanOptionsQuery({
        baseUrl: config.baseUrl,
        accountId: state.session?.accountId,
        enabled:
            state.authPhase === "authenticated" &&
            !isOffline &&
            !webRenewUsesBillingPortal &&
            (onboarding.primaryAction === "activate_or_restore" ||
                isRenewIntent),
        getOfferings: revenueCat.getOfferings,
        refreshSessionIfNeeded: actions.refreshSessionIfNeeded,
        refreshSession: actions.refreshSession,
    });

    const planOptions = activatePlansQuery.data?.options ?? [];
    const catalogBlockingError = activatePlansQuery.data?.blockingError ?? null;
    const offeringIdentifier =
        activatePlansQuery.data?.offeringIdentifier ?? null;
    const offeringsError = activatePlansQuery.error
        ? `Unable to load hosted plan catalog: ${toErrorString(activatePlansQuery.error)}`
        : catalogBlockingError
          ? catalogBlockingError
          : activatePlansQuery.isSuccess && planOptions.length === 0
            ? "Fatal configuration mismatch: no intersecting plans between Hosted Conduit catalog and current RevenueCat offering. Retry after backend catalog/offering configuration is fixed."
            : null;
    const offeringsLoading = activatePlansQuery.isPending;
    const selectedPlan = React.useMemo(() => {
        return resolveHostedSelectedPlanOption({
            options: planOptions,
            selectedPlanKey,
            selectedPlanDescriptor,
        });
    }, [planOptions, selectedPlanDescriptor, selectedPlanKey]);

    const handleSelectPlan = React.useCallback((option: HostedPlanOption) => {
        setSelectedPlanKey(option.key);
        setSelectedPlanDescriptor({
            matchedPlanId: option.matchedPlanId,
            title: option.title,
        });
    }, []);

    React.useEffect(() => {
        if (!selectedPlan) {
            return;
        }
        if (selectedPlanKey !== selectedPlan.key) {
            setSelectedPlanKey(selectedPlan.key);
        }
    }, [selectedPlan, selectedPlanKey]);

    const signInMutation = useMutation({
        mutationFn: async (provider: OAuthProvider) => actions.signIn(provider),
        onMutate: () => {
            setActionError(null);
            setActionNotice(null);
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });
    const emailCodeSignInMutation = useMutation({
        mutationFn: async (input: { email: string; code: string }) => {
            await actions.startEmailCodeSignIn(input.email);
            await actions.completeEmailCodeSignIn(input.code);
        },
        onMutate: () => {
            setActionError(null);
            setActionNotice(null);
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });

    const purchaseMutation = useMutation({
        mutationFn: async () => {
            const selected =
                selectedPlan?.package ??
                (await resolveFirstHostedPackage(
                    activatePlansQuery.data?.options ?? [],
                ));
            await actions.purchasePackage(selected);
        },
        onMutate: () => {
            setActionError(null);
            setActionNotice(null);
        },
        onError: (error) => {
            const message = toErrorString(error);
            if (isCancelledPurchaseError(message)) {
                setActionError(null);
                return;
            }
            setActionError(message);
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
            setActionNotice(t("PURCHASES_RESTORED_I18N.string"));
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });
    const openBillingPortalMutation = useMutation({
        mutationFn: async () => {
            const session = await actions.refreshSessionIfNeeded();
            const response = await hostedClient.createBillingPortalSession(
                session.accessToken,
            );
            await Linking.openURL(response.url);
        },
        onMutate: () => {
            setActionError(null);
            setActionNotice(null);
        },
        onSuccess: () => {
            setActionNotice(t("RENEW_SUBSCRIPTION_PORTAL_OPENED_I18N.string"));
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });

    // After a successful renewal purchase, redirect back to the home screen.
    React.useEffect(() => {
        if (
            rootNavigationState?.key &&
            isRenewIntent &&
            purchaseMutation.isSuccess
        ) {
            router.replace("/(app)");
        }
    }, [
        isRenewIntent,
        purchaseMutation.isSuccess,
        rootNavigationState?.key,
        router,
    ]);

    React.useEffect(() => {
        if (
            rootNavigationState?.key &&
            restorePurchasesMutation.isSuccess &&
            canContinue
        ) {
            router.replace("/(app)");
        }
    }, [
        canContinue,
        restorePurchasesMutation.isSuccess,
        rootNavigationState?.key,
        router,
    ]);

    const recoverAccessMutation = useMutation({
        mutationFn: async () => {
            const session = await actions.refreshSessionIfNeeded();
            await actions.pollConduitsOnce();
            return session;
        },
        onMutate: () => {
            setActionError(null);
            setActionNotice(null);
        },
        onError: (error) => {
            setActionError(toErrorString(error));
        },
    });

    function signIn(provider: OAuthProvider): void {
        signInMutation.mutate(provider);
    }

    function signInWithEmailCode(email: string, code: string): void {
        emailCodeSignInMutation.mutate({ email, code });
    }

    function purchaseFirstPackage(): void {
        purchaseMutation.mutate();
    }

    const hasBaseUrl = Boolean(config.baseUrl);
    const hasClerkKey = clerkPublishableKey.length > 0;
    const hasRevenueCatKeyForPlatform = hasRevenueCatPublicKeyForPlatform(
        config.revenueCatPublicKeys,
    );
    const primaryActionPending =
        signInMutation.isPending ||
        emailCodeSignInMutation.isPending ||
        purchaseMutation.isPending ||
        restorePurchasesMutation.isPending ||
        openBillingPortalMutation.isPending;
    const recoverActionPending = recoverAccessMutation.isPending;
    const setupReady = hasBaseUrl && hasClerkKey && hasRevenueCatKeyForPlatform;
    const storyParagraph = `${onboarding.detail} ${onboarding.helper}`;
    // Keep the loading spinner visible until both the persisted session AND the
    // initial conduits snapshot have been resolved.  Without this, there is a
    // window between session-hydration and the first conduits poll where the
    // state machine exposes an intermediate (signed-in, no-conduits) state that
    // briefly renders the wrong onboarding screen ("needs attention" / "activate
    // your plan") before the real status arrives.
    const awaitingBootstrapAfterSessionLoad =
        state.authPhase === "authenticated" &&
        state.conduitsSnapshot === null &&
        bootstrapConduitsQuery.isLoading;
    const showInitialLoading =
        !initialSessionResolved || awaitingBootstrapAfterSessionLoad;
    const showTransitionLoading =
        state.authPhase === "authenticating" || signInMutation.isPending;
    const activationInFlight =
        revenueCatNativeActionPending ||
        purchaseMutation.isPending ||
        restorePurchasesMutation.isPending ||
        state.revenuecatPhase === "purchase_pending" ||
        state.revenuecatPhase === "restore_pending";
    // Once activation starts, leave the plan selector immediately and keep the
    // spinner visible while RevenueCat and hosted status propagation catch up.
    const resolvedInfrastructureWait =
        onboarding.primaryAction === "wait" && state.conduitsSnapshot !== null;
    const showProvisioningScreen =
        activationInFlight ||
        state.stationPhase === "provisioning" ||
        resolvedInfrastructureWait;
    const loadingMessage = t("CONNECTING_TO_YOUR_HOSTED_CONDUIT_I18N.string");
    const showPlanSelectionScreen =
        onboarding.primaryAction === "activate_or_restore" ||
        isRenewIntent ||
        revenueCatNativeActionPending;
    const primaryActionForControls =
        isRenewIntent || revenueCatNativeActionPending
            ? "activate_or_restore"
            : onboarding.primaryAction;
    const showHostedSignInHero =
        !showPlanSelectionScreen && onboarding.primaryAction === "sign_in";
    const bootstrapRefreshError = bootstrapConduitsQuery.error
        ? `Failed to refresh hosted setup status: ${toErrorString(bootstrapConduitsQuery.error)}`
        : null;
    const currentStatusError = isOffline
        ? (state.authError ??
          state.revenuecatError ??
          state.stationError ??
          bootstrapRefreshError)
        : (state.authError ?? state.revenuecatError);
    const dedupedActionError =
        actionError &&
        normalizeStatusText(actionError) ===
            normalizeStatusText(currentStatusError)
            ? null
            : actionError;

    React.useEffect(() => {
        if (offeringsError) {
            recordVisibleClientError(offeringsError, {
                surface: "hosted-setup",
                field: "offeringsError",
            });
        }
        if (currentStatusError) {
            recordVisibleClientError(currentStatusError, {
                surface: "hosted-setup",
                field: "currentStatusError",
            });
        }
        if (dedupedActionError) {
            recordVisibleClientError(dedupedActionError, {
                surface: "hosted-setup",
                field: "actionError",
            });
        }
    }, [currentStatusError, dedupedActionError, offeringsError]);

    const centeredContentStyle = {
        width: "100%" as const,
        maxWidth: APP_MAX_CONTENT_WIDTH,
        alignSelf: "center" as const,
    };
    const hostedSetupBackButton =
        Platform.OS === "web" ? (
            <HostedSetupBackButton onPress={goBackFromHostedSetup} />
        ) : null;

    if (showInitialLoading || showTransitionLoading) {
        return (
            <SafeAreaView includeBottomInset={false}>
                {hostedSetupBackButton}
                <View
                    style={[
                        ss.flex,
                        ss.column,
                        ss.alignCenter,
                        ss.justifyCenter,
                        centeredContentStyle,
                        { padding: 24 },
                    ]}
                >
                    <ActivityIndicator size="small" color={palette.purple} />
                    <Text style={[ss.bodyFont, ss.blackText]}>
                        {loadingMessage}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    if (onboarding.primaryAction === "offline") {
        return (
            <SafeAreaView includeBottomInset={false}>
                {hostedSetupBackButton}
                <View
                    style={[
                        ss.flex,
                        ss.column,
                        ss.justifySpaceBetween,
                        centeredContentStyle,
                        { padding: 24, gap: 20 },
                    ]}
                >
                    <View style={[ss.column, ss.alignCenter, { gap: 20 }]}>
                        <ExpoImage
                            source={NO_NETWORK_ICON}
                            contentFit="contain"
                            style={{ width: 180, height: 180 }}
                        />
                        <View style={[ss.column, { gap: 10 }]}>
                            <Text
                                style={[
                                    ss.extraLargeFont,
                                    ss.blackText,
                                    ss.centeredText,
                                ]}
                            >
                                {onboarding.headline}
                            </Text>
                            <Text
                                style={[
                                    ss.bodyFont,
                                    ss.blackText,
                                    ss.centeredText,
                                ]}
                            >
                                {onboarding.detail}
                            </Text>
                        </View>
                    </View>
                    <View style={[ss.column]}>
                        <ActionButton
                            label={t("TRY_AGAIN_I18N.string")}
                            onPress={() => {
                                setActionError(null);
                                setActionNotice(null);
                                if (isOffline) {
                                    return;
                                }
                                if (state.authPhase === "authenticated") {
                                    recoverAccessMutation.mutate();
                                    return;
                                }
                                void bootstrapConduitsQuery.refetch();
                                void activatePlansQuery.refetch();
                            }}
                            disabled={recoverActionPending}
                            variant="primary"
                        />
                        <ActionButton
                            label={t("MANAGE_SETUP_DETAILS_I18N.string")}
                            onPress={() => {
                                if (canContinue) {
                                    router.push("/(app)/hosted-dashboard");
                                    return;
                                }
                                router.push("/(app)/settings");
                            }}
                            disabled={recoverActionPending}
                            variant="secondary"
                        />
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    if (webRenewUsesBillingPortal) {
        return (
            <SafeAreaView includeBottomInset={false}>
                {hostedSetupBackButton}
                <ScrollView
                    contentContainerStyle={{
                        flexGrow: 1,
                        padding: 16,
                        gap: 18,
                        justifyContent: "space-between",
                        ...centeredContentStyle,
                    }}
                >
                    <View style={[ss.column]}>
                        <Text style={[ss.extraLargeFont, ss.blackText]}>
                            {t("RENEW_SUBSCRIPTION_I18N.string")}
                        </Text>
                        <Text style={[ss.bodyFont, ss.blackText]}>
                            {t(
                                "RENEW_SUBSCRIPTION_PORTAL_DESCRIPTION_I18N.string",
                                {
                                    expiresAt: formatExpiresAt(
                                        state.conduitsSnapshot?.entitlement
                                            ?.expires_at,
                                        i18n.language,
                                    ),
                                },
                            )}
                        </Text>
                    </View>

                    <View style={[ss.column]}>
                        {currentStatusError ? (
                            <StatusText>{currentStatusError}</StatusText>
                        ) : null}
                        {dedupedActionError ? (
                            <StatusText>Error: {dedupedActionError}</StatusText>
                        ) : null}
                        {actionNotice ? (
                            <StatusText>{actionNotice}</StatusText>
                        ) : null}
                        <ActionButton
                            label={t("RENEW_SUBSCRIPTION_I18N.string")}
                            onPress={() => openBillingPortalMutation.mutate()}
                            disabled={
                                openBillingPortalMutation.isPending ||
                                !setupReady
                            }
                            variant="primary"
                            gradientBackground={true}
                        />
                        <ActionButton
                            label={t("REFRESH_SUBSCRIPTION_STATUS_I18N.string")}
                            onPress={() => recoverAccessMutation.mutate()}
                            disabled={
                                openBillingPortalMutation.isPending ||
                                recoverActionPending ||
                                !setupReady
                            }
                            variant="secondary"
                        />
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    if (showProvisioningScreen) {
        return (
            <SafeAreaView includeBottomInset={false}>
                {hostedSetupBackButton}
                <View
                    style={[
                        ss.flex,
                        ss.column,
                        ss.alignCenter,
                        ss.justifyCenter,
                        centeredContentStyle,
                        { padding: 24, gap: 16 },
                    ]}
                >
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 10,
                        }}
                    >
                        <ActivityIndicator
                            size="small"
                            color={palette.purple}
                        />
                        <Text
                            style={[
                                ss.largeFont,
                                ss.blackText,
                                { flexShrink: 1, textAlign: "center" },
                            ]}
                        >
                            {t("SETTING_UP_INFRASTRUCTURE_I18N.string")}
                        </Text>
                    </View>
                    <Text
                        style={[
                            ss.bodyFont,
                            {
                                color: palette.grey,
                                textAlign: "center",
                                marginTop: 8,
                            },
                        ]}
                    >
                        {t("PROVISIONING_LEAVE_HINT_I18N.string")}
                    </Text>
                    <Pressable
                        onPress={() => router.replace("/(app)")}
                        style={{
                            borderWidth: 1,
                            borderColor: palette.purple,
                            borderRadius: 12,
                            paddingHorizontal: 32,
                            paddingVertical: 10,
                            marginTop: 4,
                        }}
                    >
                        <Text style={[ss.bodyFont, ss.purpleText]}>
                            {t("CLOSE_I18N.string")}
                        </Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    if (onboarding.primaryAction === "wait") {
        return (
            <SafeAreaView includeBottomInset={false}>
                {hostedSetupBackButton}
                <View
                    style={[
                        ss.flex,
                        ss.column,
                        ss.alignCenter,
                        ss.justifyCenter,
                        centeredContentStyle,
                        { backgroundColor: palette.white, padding: 24 },
                    ]}
                >
                    <ActivityIndicator size="small" color={palette.purple} />
                    <Text style={[ss.bodyFont, ss.blackText]}>
                        {loadingMessage}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    if (canContinue && !isRenewIntent) {
        return (
            <SafeAreaView includeBottomInset={false}>
                {hostedSetupBackButton}
                <View
                    style={[
                        ss.flex,
                        ss.column,
                        ss.alignCenter,
                        ss.justifyCenter,
                        centeredContentStyle,
                        { padding: 24 },
                    ]}
                >
                    <ActivityIndicator size="small" color={palette.purple} />
                    <Text style={[ss.bodyFont, ss.blackText]}>
                        {t("OPENING_YOUR_DASHBOARD_I18N.string")}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView includeBottomInset={false}>
            <View
                testID="hosted-setup-ready"
                pointerEvents="none"
                style={{ width: 1, height: 1 }}
            />
            <ScrollView
                contentContainerStyle={{
                    flexGrow: 1,
                    padding: 16,
                    gap: 14,
                    justifyContent: "space-between",
                    ...centeredContentStyle,
                }}
            >
                {hostedSetupBackButton}
                <View style={[ss.column]}>
                    {showPlanSelectionScreen ? (
                        <HostedPlanSelection
                            offeringsLoading={offeringsLoading}
                            offeringsError={offeringsError}
                            offeringIdentifier={offeringIdentifier}
                            options={planOptions}
                            selectedPlanKey={selectedPlan?.key ?? null}
                            onSelectPlan={handleSelectPlan}
                            onRetry={() => {
                                void activatePlansQuery.refetch();
                            }}
                        />
                    ) : (
                        <>
                            {showHostedSignInHero ? (
                                <View style={{ marginHorizontal: -16 }}>
                                    <HostedSetupSignInHero
                                        headline={onboarding.headline}
                                        body={storyParagraph}
                                        width={window.width}
                                    />
                                </View>
                            ) : null}
                            {onboarding.primaryAction !== "sign_in" ? (
                                <View style={[ss.column]}>
                                    <Text
                                        style={[
                                            ss.extraLargeFont,
                                            ss.blackText,
                                        ]}
                                    >
                                        {onboarding.headline}
                                    </Text>
                                    <Text style={[ss.bodyFont, ss.blackText]}>
                                        {storyParagraph}
                                    </Text>
                                </View>
                            ) : null}
                            {onboarding.primaryAction === "share_or_manage" &&
                            conduits.length > 0 ? (
                                <View
                                    style={[
                                        ss.row,
                                        ss.flexWrap,
                                        {
                                            gap: 8,
                                            marginTop: 10,
                                        },
                                    ]}
                                >
                                    {orderedConduitsForDisplay(conduits).map(
                                        (conduit) => (
                                            <View
                                                key={conduit.conduit_id}
                                                style={[
                                                    ss.midGreyBorder,
                                                    ss.rounded10,
                                                    ss.padded,
                                                    {
                                                        backgroundColor:
                                                            palette.white,
                                                        minWidth: 140,
                                                        gap: 5,
                                                        flex: 1,
                                                    },
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        ss.tinyFont,
                                                        ss.blackText,
                                                    ]}
                                                >
                                                    {formatConduitScope(
                                                        conduit.traffic_scope,
                                                        t,
                                                    )}
                                                </Text>
                                                <View
                                                    style={[
                                                        ss.row,
                                                        ss.alignCenter,
                                                        ss.justifyCenter,
                                                    ]}
                                                >
                                                    {conduit.proxy_id ? (
                                                        <ProxyID
                                                            proxyId={
                                                                conduit.proxy_id
                                                            }
                                                            copyable={true}
                                                        />
                                                    ) : (
                                                        <Text
                                                            style={[
                                                                ss.bodyFont,
                                                                ss.blackText,
                                                            ]}
                                                        >
                                                            {t(
                                                                "UNAVAILABLE_I18N.string",
                                                            )}
                                                        </Text>
                                                    )}
                                                </View>
                                                <View
                                                    style={[
                                                        ss.row,
                                                        ss.justifyFlexEnd,
                                                    ]}
                                                >
                                                    <Text
                                                        style={[
                                                            ss.tinyFont,
                                                            ss.blackText,
                                                        ]}
                                                    >
                                                        {conduit.status}
                                                    </Text>
                                                </View>
                                            </View>
                                        ),
                                    )}
                                </View>
                            ) : null}
                        </>
                    )}

                    {!setupReady ? (
                        <StatusText>
                            {t("SETUP_INCOMPLETE_I18N.string")}
                        </StatusText>
                    ) : null}
                </View>

                <View style={[ss.column]}>
                    {currentStatusError ? (
                        <StatusText>{currentStatusError}</StatusText>
                    ) : null}

                    {dedupedActionError ? (
                        <StatusText>Error: {dedupedActionError}</StatusText>
                    ) : null}
                    {actionNotice ? (
                        <StatusText>{actionNotice}</StatusText>
                    ) : null}

                    <PrimaryActionBlock
                        onboardingAction={primaryActionForControls}
                        setupReady={setupReady}
                        authPhase={state.authPhase}
                        actionPending={primaryActionPending}
                        activatePlan={selectedPlan}
                        activateOfferingsLoading={offeringsLoading}
                        activateOfferingsError={offeringsError}
                        onSignInGoogle={() => signIn("google")}
                        onSignInApple={() => signIn("apple")}
                        onSignInEmailCode={signInWithEmailCode}
                        onPurchase={purchaseFirstPackage}
                        onRestorePurchases={() => {
                            restorePurchasesMutation.mutate();
                        }}
                        onRecoverAccess={() => {
                            recoverAccessMutation.mutate();
                        }}
                        recoverActionPending={recoverActionPending}
                        onOpenManage={() => {
                            if (canContinue) {
                                router.push("/(app)/hosted-dashboard");
                                return;
                            }
                            router.push("/(app)/settings");
                        }}
                    />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function hasRevenueCatPublicKeyForPlatform(
    publicKeys: ReturnType<
        typeof readHostedRuntimeConfig
    >["revenueCatPublicKeys"],
): boolean {
    if (!publicKeys) {
        return false;
    }

    try {
        resolveRevenueCatApiKey(publicKeys, Platform.OS);
        return true;
    } catch {
        return false;
    }
}

function listRestoreOrManageReasons(
    state: ReturnType<typeof useHostedExperienceState>,
): string[] {
    const reasons: string[] = [];
    if (state.entitlementSnapshot === "expired") {
        reasons.push("entitlement_expired");
    }
    if (state.stationPhase === "suspended") {
        reasons.push("station_suspended");
    }
    if (state.stationPhase === "error") {
        reasons.push("station_error");
    }
    if (state.stationError) {
        reasons.push("station_error_detail");
    }
    if (state.polling.lastError) {
        reasons.push("polling_error");
    }
    if (state.revenuecatError) {
        reasons.push("revenuecat_error");
    }
    return reasons;
}

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
import {
    Canvas,
    Group,
    LinearGradient,
    Rect,
    vec,
} from "@shopify/react-native-skia";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import * as Network from "expo-network";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { useSharedValue, withTiming } from "react-native-reanimated";

import { toErrorString } from "@/src/common/errors";
import { timedLog } from "@/src/common/utils";
import { HostedSetupSignInHero } from "@/src/components/HostedSetupSignInHero";
import { ProxyID } from "@/src/components/ProxyID";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { OnboardingScene } from "@/src/components/canvas/OnboardingScene";
import { readHostedClerkPublishableKey } from "@/src/hosted/auth/clerk";
import { createHostedClient } from "@/src/hosted/client";
import {
    formatConduitScope,
    orderedConduitsForDisplay,
} from "@/src/hosted/conduitDisplay";
import { readHostedRuntimeConfig } from "@/src/hosted/config";
import { OAuthProvider } from "@/src/hosted/contracts";
import {
    buildHostedPlanCatalogQuery,
    getHostedAppVersion,
    getHostedCountry,
} from "@/src/hosted/deviceInfo";
import {
    useHostedExperienceActions,
    useHostedExperienceInitialSessionResolved,
    useHostedExperienceLastAuthProvider,
    useHostedExperienceState,
} from "@/src/hosted/experience/hooks";
import { shouldRouteToHostedActiveExperience } from "@/src/hosted/experience/navigation";
import {
    HostedOnboardingPrimaryAction,
    createHostedOnboardingViewModel,
} from "@/src/hosted/experience/onboarding";
import { resolveHostedPlanOptions } from "@/src/hosted/planCatalog";
import {
    HostedPlanOption,
    HostedPlanSelectionDescriptor,
    formatHostedPlanPrice,
    isCancelledPurchaseError,
    normalizeStatusText,
    resolveFirstHostedPackage,
    resolveHostedSelectedPlanOption,
    toRevenueCatPackageCandidates,
} from "@/src/hosted/planUtils";
import { resolveRevenueCatApiKey } from "@/src/hosted/revenuecatClient";
import { useRevenueCatContext } from "@/src/hosted/revenuecatContext";
import { palette, sharedStyles as ss } from "@/src/styles";

type ActionButtonVariant = "primary" | "secondary";

const GOOGLE_SIGN_IN_ICON = require("../../../assets/images/google.png");
const APPLE_SIGN_IN_ICON = require("../../../assets/images/apple.png");
const NO_NETWORK_ICON = require("@/assets/images/icons/no-network.svg");
const HOSTED_PRIMARY_GRADIENT_START = "#7E5CB8";
const HOSTED_PRIMARY_GRADIENT_END = "rgba(156, 129, 201, 0.69)";

export default function HostedSetupScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { intent } = useLocalSearchParams<{ intent?: string }>();
    const isRenewIntent = intent === "renew";
    const config = React.useMemo(readHostedRuntimeConfig, []);
    const clerkPublishableKey = React.useMemo(
        readHostedClerkPublishableKey,
        [],
    );
    const state = useHostedExperienceState();
    const initialSessionResolved = useHostedExperienceInitialSessionResolved();
    const lastAuthProvider = useHostedExperienceLastAuthProvider();
    const actions = useHostedExperienceActions();
    const revenueCat = useRevenueCatContext();
    const hostedClient = React.useMemo(
        () => createHostedClient({ baseUrl: config.baseUrl }),
        [config.baseUrl],
    );
    const window = useWindowDimensions();
    const networkState = Network.useNetworkState();
    const isOffline =
        networkState.isConnected === false ||
        networkState.isInternetReachable === false;

    const [actionError, setActionError] = React.useState<string | null>(null);
    const [actionNotice, setActionNotice] = React.useState<string | null>(null);
    const [selectedPlanKey, setSelectedPlanKey] = React.useState<string | null>(
        null,
    );
    const [selectedPlanDescriptor, setSelectedPlanDescriptor] =
        React.useState<HostedPlanSelectionDescriptor | null>(null);

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
    const sceneViewIndex = React.useMemo(
        () => toSceneViewIndex(onboarding.primaryAction),
        [onboarding.primaryAction],
    );
    const sceneView = useSharedValue(sceneViewIndex);
    const attentionLogSignatureRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        // In renewal mode the user already has an allowed entitlement, so
        // canContinue is true on mount.  Skip the auto-redirect and let them
        // pick a plan; we redirect after a successful purchase instead.
        if (!canContinue || isRenewIntent) {
            return;
        }
        router.replace("/(app)");
    }, [canContinue, isRenewIntent, router]);

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

    React.useEffect(() => {
        sceneView.value = withTiming(sceneViewIndex, { duration: 600 });
    }, [sceneView, sceneViewIndex]);

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

    const activatePlansQuery = useQuery({
        queryKey: ["hosted", "activate-offerings", state.session?.accountId],
        enabled:
            state.authPhase === "authenticated" &&
            !isOffline &&
            (onboarding.primaryAction === "activate_or_restore" ||
                isRenewIntent),
        queryFn: async () => {
            const [offerings, session] = await Promise.all([
                revenueCat.getOfferings(),
                actions.refreshSessionIfNeeded(),
            ]);
            const planCatalog = await hostedClient.getPlanCatalog(
                session.accessToken,
                buildHostedPlanCatalogQuery(),
            );
            const fallback = resolveHostedPlanOptions({
                catalog: planCatalog,
                platform: Platform.OS === "ios" ? "ios" : "android",
                appVersion: getHostedAppVersion(),
                country: getHostedCountry(),
                revenueCatPackages: toRevenueCatPackageCandidates(offerings),
            });
            return {
                options: fallback.options,
                blockingError: fallback.blockingError,
                offeringIdentifier: offerings.current?.identifier ?? null,
            };
        },
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        retry: 3,
        retryDelay: 5_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchInterval: (query) => (query.state.error ? 10_000 : false),
        placeholderData: (previous) => previous,
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

    // After a successful renewal purchase, redirect back to the home screen.
    React.useEffect(() => {
        if (isRenewIntent && purchaseMutation.isSuccess) {
            router.replace("/(app)");
        }
    }, [isRenewIntent, purchaseMutation.isSuccess, router]);

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

    function purchaseFirstPackage(): void {
        purchaseMutation.mutate();
    }

    const hasBaseUrl = Boolean(config.baseUrl);
    const hasClerkKey = clerkPublishableKey.length > 0;
    const hasRevenueCatKeyForPlatform = hasRevenueCatPublicKeyForPlatform(
        config.revenueCatPublicKeys,
    );
    const primaryActionPending =
        signInMutation.isPending || purchaseMutation.isPending;
    const recoverActionPending = recoverAccessMutation.isPending;
    const activationInFlight =
        purchaseMutation.isPending ||
        state.revenuecatPhase === "purchase_pending" ||
        state.revenuecatPhase === "restore_pending";
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
    // Keep the provisioning screen visible when a purchase or restore mutation
    // just succeeded but the conduits query observer hasn't propagated the
    // final poll data yet.  Without this guard there is a 1-frame render gap
    // where the state falls back to "plan selection" before the redirect fires.
    const purchaseSucceededAwaitingSync =
        purchaseMutation.isSuccess && !canContinue;
    const showProvisioningScreen =
        onboarding.primaryAction === "wait" ||
        (activationInFlight &&
            (onboarding.primaryAction !== "share_or_manage" ||
                isRenewIntent)) ||
        purchaseSucceededAwaitingSync;
    const loadingMessage = t("CONNECTING_TO_YOUR_HOSTED_CONDUIT_I18N.string");
    const showPlanSelectionScreen =
        onboarding.primaryAction === "activate_or_restore" || isRenewIntent;
    const showHostedSignInHero =
        !showPlanSelectionScreen && onboarding.primaryAction === "sign_in";
    const showSkiaScene =
        !showPlanSelectionScreen &&
        onboarding.primaryAction !== "share_or_manage" &&
        onboarding.primaryAction !== "sign_in";
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

    const sceneWidth = Math.max(240, Math.min(window.width - 32, 520));
    const sceneHeight = Math.max(220, Math.min(window.height * 0.32, 320));

    if (showInitialLoading || showTransitionLoading) {
        return (
            <SafeAreaView includeBottomInset={false}>
                <View
                    style={[
                        ss.flex,
                        ss.column,
                        ss.alignCenter,
                        ss.justifyCenter,
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
                <View
                    style={[
                        ss.flex,
                        ss.column,
                        ss.justifySpaceBetween,
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
                            label={t("TRY_AGAIN_I18N.string", {
                                defaultValue: "Try again",
                            })}
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

    if (showProvisioningScreen) {
        return (
            <SafeAreaView includeBottomInset={false}>
                <View
                    style={[
                        ss.flex,
                        ss.column,
                        ss.alignCenter,
                        ss.justifyCenter,
                        { padding: 24, gap: 16 },
                    ]}
                >
                    <ActivityIndicator size="small" color={palette.purple} />
                    <Text style={[ss.largeFont, ss.blackText]}>
                        {t("SETTING_UP_INFRASTRUCTURE_I18N.string")}
                    </Text>
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

    if (canContinue && !isRenewIntent) {
        return (
            <SafeAreaView includeBottomInset={false}>
                <View
                    style={[
                        ss.flex,
                        ss.column,
                        ss.alignCenter,
                        ss.justifyCenter,
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
            <ScrollView
                contentContainerStyle={{
                    flexGrow: 1,
                    padding: 16,
                    gap: 14,
                    justifyContent: "space-between",
                }}
            >
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
                            {showSkiaScene ? (
                                <View
                                    style={{
                                        width: "100%",
                                        height: sceneHeight,
                                        borderWidth: 1,
                                        borderColor: palette.thinPurple,
                                        borderRadius: 16,
                                        overflow: "hidden",
                                        backgroundColor: palette.white,
                                    }}
                                >
                                    <Canvas style={{ flex: 1 }}>
                                        <Group>
                                            <OnboardingScene
                                                currentView={sceneView}
                                                sceneWidth={sceneWidth}
                                                sceneHeight={sceneHeight}
                                            />
                                        </Group>
                                    </Canvas>
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
                        onboardingAction={
                            isRenewIntent
                                ? "activate_or_restore"
                                : onboarding.primaryAction
                        }
                        setupReady={setupReady}
                        authPhase={state.authPhase}
                        actionPending={primaryActionPending}
                        activatePlan={selectedPlan}
                        activateOfferingsLoading={offeringsLoading}
                        activateOfferingsError={offeringsError}
                        onSignInGoogle={() => signIn("google")}
                        onSignInApple={() => signIn("apple")}
                        onPurchase={purchaseFirstPackage}
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

function HostedPlanSelection({
    offeringsLoading,
    offeringsError,
    options,
    selectedPlanKey,
    onSelectPlan,
    onRetry,
}: {
    offeringsLoading: boolean;
    offeringsError: string | null;
    offeringIdentifier: string | null;
    options: HostedPlanOption[];
    selectedPlanKey: string | null;
    onSelectPlan: (option: HostedPlanOption) => void;
    onRetry: () => void;
}) {
    const { t } = useTranslation();
    return (
        <View style={[ss.column]}>
            <Text style={[ss.extraLargeFont, ss.blackText, ss.centeredText]}>
                {t("CHOOSE_A_PLAN_I18N.string")}
            </Text>
            {offeringsLoading ? (
                <StatusText>Loading plan options from RevenueCat...</StatusText>
            ) : null}
            {options.length > 0
                ? options.map((option) => {
                      const selected = selectedPlanKey === option.key;
                      const textColor = selected
                          ? palette.white
                          : palette.black;
                      const badgeColor = selected
                          ? palette.white
                          : palette.purple;
                      return (
                          <Pressable
                              key={option.key}
                              onPress={() => {
                                  onSelectPlan(option);
                              }}
                              style={{
                                  borderWidth: 2,
                                  borderColor: selected
                                      ? palette.purple
                                      : palette.thinPurple,
                                  borderRadius: 14,
                                  paddingHorizontal: 14,
                                  paddingVertical: 12,
                                  backgroundColor: selected
                                      ? HOSTED_PRIMARY_GRADIENT_START
                                      : palette.white,
                                  shadowColor: selected
                                      ? HOSTED_PRIMARY_GRADIENT_START
                                      : palette.transparent,
                                  shadowOpacity: selected ? 0.34 : 0,
                                  shadowRadius: selected ? 12 : 0,
                                  shadowOffset: {
                                      width: 0,
                                      height: selected ? 6 : 0,
                                  },
                                  elevation: selected ? 4 : 0,
                                  gap: 6,
                              }}
                          >
                              <View
                                  style={{
                                      flexDirection: "row",
                                      justifyContent: "space-between",
                                      alignItems: "flex-start",
                                      gap: 8,
                                  }}
                              >
                                  <Text
                                      style={[
                                          ss.bodyFont,
                                          {
                                              color: textColor,
                                              flexShrink: 1,
                                          },
                                      ]}
                                  >
                                      {option.title}
                                  </Text>
                                  {option.badge ? (
                                      <Text
                                          style={[
                                              ss.tinyFont,
                                              { color: badgeColor },
                                          ]}
                                      >
                                          {option.badge}
                                      </Text>
                                  ) : null}
                              </View>
                              {option.features.map((feature) => (
                                  <Text
                                      key={`${option.key}-${feature}`}
                                      style={[
                                          ss.bodyFont,
                                          { fontSize: 16, color: textColor },
                                      ]}
                                  >
                                      - {feature}
                                  </Text>
                              ))}
                              <View
                                  style={{
                                      width: "100%",
                                      justifyContent: "flex-end",
                                      alignItems: "flex-end",
                                  }}
                              >
                                  <Text
                                      style={[
                                          ss.bodyFont,
                                          { color: textColor },
                                      ]}
                                  >
                                      {formatHostedPlanPrice(option)}
                                  </Text>
                              </View>
                          </Pressable>
                      );
                  })
                : null}
            {offeringsError ? <StatusText>{offeringsError}</StatusText> : null}
            {offeringsError ? (
                <ActionButton
                    label={t("RETRY_PLAN_LOAD_I18N.string")}
                    onPress={onRetry}
                    variant="secondary"
                />
            ) : null}
        </View>
    );
}

function PrimaryActionBlock({
    onboardingAction,
    setupReady,
    authPhase,
    actionPending,
    activatePlan,
    activateOfferingsLoading,
    activateOfferingsError,
    onSignInGoogle,
    onSignInApple,
    onPurchase,
    onRecoverAccess,
    recoverActionPending,
    onOpenManage,
}: {
    onboardingAction: HostedOnboardingPrimaryAction;
    setupReady: boolean;
    authPhase: string;
    actionPending: boolean;
    activatePlan: HostedPlanOption | null;
    activateOfferingsLoading: boolean;
    activateOfferingsError: string | null;
    onSignInGoogle: () => void;
    onSignInApple: () => void;
    onPurchase: () => void;
    onRecoverAccess: () => void;
    recoverActionPending: boolean;
    onOpenManage: () => void;
}) {
    const { t } = useTranslation();
    if (onboardingAction === "sign_in") {
        return (
            <View style={[ss.column]}>
                <ActionButton
                    label={t("SIGN_IN_WITH_GOOGLE_I18N.string")}
                    onPress={onSignInGoogle}
                    disabled={actionPending || !setupReady}
                    variant="primary"
                    gradientBackground={true}
                    leadingIcon={GOOGLE_SIGN_IN_ICON}
                />
                {Platform.OS === "ios" ? (
                    <ActionButton
                        label={t("SIGN_IN_WITH_APPLE_I18N.string")}
                        onPress={onSignInApple}
                        disabled={actionPending || !setupReady}
                        variant="secondary"
                        gradientBackground={true}
                        leadingIcon={APPLE_SIGN_IN_ICON}
                        leadingIconTintColor={palette.black}
                    />
                ) : null}
            </View>
        );
    }

    if (onboardingAction === "activate_or_restore") {
        return (
            <View style={[ss.column]}>
                {activateOfferingsLoading ? (
                    <StatusText>Loading plans from RevenueCat...</StatusText>
                ) : null}
                {activateOfferingsError ? (
                    <StatusText>{activateOfferingsError}</StatusText>
                ) : null}
                <ActionButton
                    label={t("CONTINUE_I18N.string")}
                    onPress={onPurchase}
                    disabled={
                        actionPending ||
                        authPhase !== "authenticated" ||
                        !setupReady ||
                        activateOfferingsLoading ||
                        Boolean(activateOfferingsError) ||
                        (!activatePlan && !activateOfferingsError)
                    }
                    variant="primary"
                    gradientBackground={true}
                />
            </View>
        );
    }

    if (onboardingAction === "wait") {
        return null;
    }

    if (onboardingAction === "offline") {
        return null;
    }

    if (onboardingAction === "restore_or_manage") {
        return (
            <View style={[ss.column]}>
                <ActionButton
                    label={t("CONTINUE_RETRY_INFRA_CHECK_I18N.string")}
                    onPress={onRecoverAccess}
                    disabled={
                        actionPending ||
                        recoverActionPending ||
                        authPhase !== "authenticated" ||
                        !setupReady
                    }
                    variant="primary"
                />
                <ActionButton
                    label={t("MANAGE_SETUP_DETAILS_I18N.string")}
                    onPress={onOpenManage}
                    disabled={actionPending}
                    variant="secondary"
                />
            </View>
        );
    }

    return null;
}

function toSceneViewIndex(action: HostedOnboardingPrimaryAction): number {
    switch (action) {
        case "sign_in":
            return 0;
        case "offline":
        case "share_or_manage":
            return 1;
        case "wait":
            return 2;
        case "activate_or_restore":
        case "restore_or_manage":
        default:
            return 3;
    }
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

function StatusText(props: React.PropsWithChildren) {
    return (
        <Text
            style={[
                ss.tinyFont,
                ss.blackText,
                {
                    borderWidth: 1,
                    borderColor: palette.thinPurple,
                    borderRadius: 10,
                    padding: 10,
                    backgroundColor: palette.whiteHighlight,
                },
            ]}
        >
            {props.children}
        </Text>
    );
}

function ActionButton({
    label,
    onPress,
    disabled,
    variant,
    gradientBackground,
    leadingIcon,
    leadingIconTintColor,
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    variant: ActionButtonVariant;
    gradientBackground?: boolean;
    leadingIcon?: number;
    leadingIconTintColor?: string;
}) {
    const [buttonWidth, setButtonWidth] = React.useState(0);
    const isPrimary = variant === "primary";
    const showGradient = Boolean(gradientBackground) && !disabled;
    const textColor = showGradient ? palette.white : palette.black;

    return (
        <Pressable
            onLayout={(event) => {
                setButtonWidth(event.nativeEvent.layout.width);
            }}
            style={{
                borderWidth: 1,
                borderColor: palette.purple,
                borderRadius: 12,
                height: 48,
                paddingHorizontal: showGradient ? 0 : 14,
                justifyContent: "center",
                alignItems: "center",
                overflow: "hidden",
                backgroundColor: disabled
                    ? palette.fadedMauve
                    : showGradient
                      ? palette.transparent
                      : isPrimary
                        ? palette.purpleTint3
                        : palette.white,
            }}
            onPress={onPress}
            disabled={disabled}
        >
            {showGradient ? (
                <View style={[ss.absoluteFill]} pointerEvents="none">
                    <Canvas style={{ flex: 1 }}>
                        <Rect
                            x={0}
                            y={0}
                            width={Math.max(1, buttonWidth)}
                            height={48}
                        >
                            <LinearGradient
                                start={vec(0, 24)}
                                end={vec(Math.max(1, buttonWidth), 24.3)}
                                colors={[
                                    HOSTED_PRIMARY_GRADIENT_START,
                                    HOSTED_PRIMARY_GRADIENT_END,
                                ]}
                            />
                        </Rect>
                    </Canvas>
                </View>
            ) : null}
            <View style={[ss.row, ss.alignCenter, ss.justifyCenter]}>
                {leadingIcon ? (
                    <View
                        style={{
                            backgroundColor: palette.white,
                            padding: 5,
                            borderRadius: 20,
                            borderWidth: 1,
                            borderColor: palette.purple,
                        }}
                    >
                        <ExpoImage
                            source={leadingIcon}
                            contentFit="contain"
                            style={{
                                width: 18,
                                height: 18,
                                tintColor: leadingIconTintColor,
                            }}
                        />
                    </View>
                ) : null}
                <Text
                    style={[ss.bodyFont, ss.centeredText, { color: textColor }]}
                >
                    {label}
                </Text>
            </View>
        </Pressable>
    );
}

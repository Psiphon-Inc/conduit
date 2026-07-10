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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "@react-navigation/native";
import {
    Canvas,
    LinearGradient as SkiaLinearGradient,
    Rect as SkiaRect,
    vec,
} from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { useRootNavigationState, useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    InteractionManager,
    LayoutAnimation,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import Animated, {
    Easing,
    cancelAnimation,
    runOnJS,
    useAnimatedReaction,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated";

import { isE2E } from "@/src/common/e2e";
import { toErrorString } from "@/src/common/errors";
import { formatBytes } from "@/src/common/formatters";
import { HostedConduitCard } from "@/src/components/HostedConduitCard";
import type {
    HostedStatusMode,
    HostedStatusPanelTimeseries,
} from "@/src/components/HostedStatusPanel";
import { HostedStatusPanel } from "@/src/components/HostedStatusPanel";
import { Icon } from "@/src/components/Icon";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { StatsSyncStatusRow } from "@/src/components/StatsSyncStatusRow";
import {
    APP_MAX_CONTENT_WIDTH,
    ASYNCSTORAGE_DASHBOARD_RECENT_WINDOW_KEY,
    ASYNCSTORAGE_DASHBOARD_STATION_MODE_KEY,
    ASYNCSTORAGE_DASHBOARD_STATUS_MODE_KEY,
} from "@/src/constants";
import {
    orderedConduitsForDisplay,
    resolveConnectedCount,
} from "@/src/hosted/conduitDisplay";
import { ConduitView, RecentWindow } from "@/src/hosted/contracts";
import {
    RegionalMapGlyph,
    RegionalWorldMap,
    supportsRegionalMapRegion,
} from "@/src/hosted/dashboard/RegionalWorldMap";
import {
    interpolateSummaryVector,
    summaryAggregateToVector,
    summaryVectorToAggregate,
} from "@/src/hosted/dashboard/animation";
import { useHostedDashboardStatsQueries } from "@/src/hosted/dashboard/hooks";
import {
    hasLocalDashboardHistory,
    sumRegionActivityBytes,
    sumTransferredFromSegment,
    toDashboardRegionMetrics,
    toLocalRegionalWindowKey,
    toLocalStatusTimeseries,
    toLocalSummaryAggregate,
} from "@/src/hosted/dashboard/localTransforms";
import {
    RegionalImpactRow,
    mergeRegionalActivity,
    toRegionLabel,
} from "@/src/hosted/dashboard/regional";
import {
    DashboardRecentData,
    DashboardSummaryAggregate,
    aggregateDashboardSummaries,
    toDashboardSummaryAggregateFromLive,
    toPersonalActiveUsersTimeseries,
    toPersonalBytesTransferredTimeseries,
    toPersonalConnectingUsersTimeseries,
    toPublicActiveUsersTimeseries,
    toPublicBytesTransferredTimeseries,
    toPublicConnectingUsersTimeseries,
} from "@/src/hosted/dashboard/transforms";
import {
    toRegionalBreakdownWindow,
    toSummaryWindow,
} from "@/src/hosted/dashboard/windowMapping";
import {
    useHostedExperienceInitialSessionResolved,
    useHostedExperienceState,
} from "@/src/hosted/experience/hooks";
import { shouldRouteToHostedActiveExperience } from "@/src/hosted/experience/navigation";
import { useInproxyContext } from "@/src/inproxy/context";
import {
    useInproxyActivitySegments,
    useInproxyActivityStatsReady,
    useInproxyRegionalBreakdownByWindow,
    useInproxyStatus,
} from "@/src/inproxy/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

type DashboardStationMode = "hosted" | "local";
const SUMMARY_ANIMATION_STEPS = 12;

export default function HostedDashboardScreen() {
    const router = useRouter();
    const rootNavigationState = useRootNavigationState();
    const win = useWindowDimensions();
    const state = useHostedExperienceState();
    const initialSessionResolved = useHostedExperienceInitialSessionResolved();
    const isFocused = useIsFocused();
    const { t } = useTranslation();
    const supportsLocalDashboard = Platform.OS === "android";
    const { toggleInproxy } = useInproxyContext();

    const [recentWindow, setRecentWindowState] =
        React.useState<RecentWindow>("5m");
    const [stationMode, setStationModeState] =
        React.useState<DashboardStationMode>("hosted");
    const [statusMode, setStatusModeState] =
        React.useState<HostedStatusMode>("bytes");
    const [windowResolved, setWindowResolved] = React.useState(false);
    const [stationModeResolved, setStationModeResolved] = React.useState(
        !supportsLocalDashboard,
    );
    const [statusModeResolved, setStatusModeResolved] = React.useState(false);
    const setRecentWindow = React.useCallback((window: RecentWindow) => {
        setRecentWindowState(window);
        void AsyncStorage.setItem(
            ASYNCSTORAGE_DASHBOARD_RECENT_WINDOW_KEY,
            window,
        );
    }, []);
    const [heavyContentReady, setHeavyContentReady] = React.useState(false);
    const scrollViewRef = React.useRef<ScrollView>(null);
    const [conduitsExpanded, setConduitsExpanded] = React.useState(false);
    const chevronRotation = useSharedValue(0);
    const chevronStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${chevronRotation.value}deg` }],
    }));

    React.useEffect(() => {
        void AsyncStorage.getItem(
            ASYNCSTORAGE_DASHBOARD_RECENT_WINDOW_KEY,
        ).then(
            (stored) => {
                if (
                    stored === "5m" ||
                    stored === "48h" ||
                    stored === "7d" ||
                    stored === "30d"
                ) {
                    setRecentWindowState(stored);
                }
                setWindowResolved(true);
            },
            () => {
                setWindowResolved(true);
            },
        );
    }, []);

    const setStationMode = React.useCallback((next: DashboardStationMode) => {
        setStationModeState(next);
        void AsyncStorage.setItem(
            ASYNCSTORAGE_DASHBOARD_STATION_MODE_KEY,
            next,
        );
    }, []);

    const setStatusMode = React.useCallback((next: HostedStatusMode) => {
        setStatusModeState(next);
        void AsyncStorage.setItem(ASYNCSTORAGE_DASHBOARD_STATUS_MODE_KEY, next);
    }, []);

    React.useEffect(() => {
        void AsyncStorage.getItem(ASYNCSTORAGE_DASHBOARD_STATUS_MODE_KEY).then(
            (stored) => {
                if (stored === "bytes" || stored === "connected") {
                    setStatusModeState(stored);
                }
                setStatusModeResolved(true);
            },
            () => {
                setStatusModeResolved(true);
            },
        );
    }, []);

    React.useEffect(() => {
        if (!supportsLocalDashboard) {
            setStationModeResolved(true);
            return;
        }
        void AsyncStorage.getItem(ASYNCSTORAGE_DASHBOARD_STATION_MODE_KEY).then(
            (stored) => {
                if (stored === "local" || stored === "hosted") {
                    setStationModeState(stored);
                }
                setStationModeResolved(true);
            },
            () => {
                setStationModeResolved(true);
            },
        );
    }, [supportsLocalDashboard]);

    const toggleConduitsExpanded = React.useCallback(() => {
        const next = !conduitsExpanded;
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setConduitsExpanded(next);
        chevronRotation.value = withTiming(next ? 180 : 0, { duration: 300 });
        if (next) {
            setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 350);
        }
    }, [conduitsExpanded, chevronRotation]);

    const canContinue = shouldRouteToHostedActiveExperience(state);
    const hostedAvailable = canContinue;
    const effectiveStationMode =
        supportsLocalDashboard && !hostedAvailable && stationMode === "hosted"
            ? "local"
            : stationMode;
    const showingLocalDashboard =
        supportsLocalDashboard && effectiveStationMode === "local";
    const conduits = state.conduitsSnapshot?.conduits ?? [];
    const dashboardValueAnimationMs = 1_200;
    const summaryWindow = React.useMemo(
        () => toSummaryWindow(recentWindow),
        [recentWindow],
    );
    const regionalBreakdownWindow = React.useMemo(
        () => toRegionalBreakdownWindow(recentWindow),
        [recentWindow],
    );

    const localSegmentsQuery = useInproxyActivitySegments();
    const localActivityStatsReadyQuery = useInproxyActivityStatsReady();
    const localRegionalBreakdownByWindowQuery =
        useInproxyRegionalBreakdownByWindow();
    const localStatusQuery = useInproxyStatus();

    const localConduitStatus = React.useMemo(() => {
        switch (localStatusQuery.data) {
            case "RUNNING":
                return t("RUNNING_I18N.string");
            case "STOPPED":
                return t("STOPPED_I18N.string");
            default:
                return t("UNKNOWN_I18N.string");
        }
    }, [localStatusQuery.data, t]);

    const dashboardStateResolved =
        windowResolved && stationModeResolved && statusModeResolved;
    const {
        statsEnabled,
        shouldPoll,
        statsSessionQuery,
        summaryQuery,
        summaryThirtyDayQuery,
        recentQuery,
        regionalRecentQuery,
        liveQuery,
    } = useHostedDashboardStatsQueries({
        enabled: dashboardStateResolved && canContinue,
        isFocused,
        recentWindow,
        summaryWindow,
        regionalBreakdownWindow,
    });

    React.useEffect(() => {
        if (!dashboardStateResolved || !isFocused) {
            setHeavyContentReady(false);
            return;
        }

        let cancelled = false;
        let released = false;
        let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
        const releaseHeavyGate = () => {
            if (cancelled || released) {
                return;
            }
            released = true;
            if (fallbackTimer) {
                clearTimeout(fallbackTimer);
            }
            setHeavyContentReady(true);
        };
        const task = InteractionManager.runAfterInteractions(() => {
            releaseHeavyGate();
        });
        fallbackTimer = setTimeout(() => {
            releaseHeavyGate();
        }, 900);

        return () => {
            cancelled = true;
            task.cancel();
            if (fallbackTimer) {
                clearTimeout(fallbackTimer);
            }
        };
    }, [dashboardStateResolved, isFocused]);

    const heavyDashboardContentReady =
        dashboardStateResolved && isFocused && heavyContentReady;

    const hostedRecentData = React.useMemo<DashboardRecentData | null>(() => {
        const candidate = recentQuery.data;
        if (
            !candidate ||
            !Array.isArray((candidate as { series?: unknown }).series)
        ) {
            return null;
        }
        return candidate;
    }, [recentQuery.data]);

    const hostedStatusTimeseries = React.useMemo(() => {
        if (!heavyDashboardContentReady || !hostedRecentData) {
            return undefined;
        }
        return {
            bytesTransferred: {
                personal:
                    toPersonalBytesTransferredTimeseries(hostedRecentData),
                public: toPublicBytesTransferredTimeseries(hostedRecentData),
            },
            connectedUsers: {
                personal: toPersonalActiveUsersTimeseries(hostedRecentData),
                public: toPublicActiveUsersTimeseries(hostedRecentData),
            },
            connectingUsers: {
                personal: toPersonalConnectingUsersTimeseries(hostedRecentData),
                public: toPublicConnectingUsersTimeseries(hostedRecentData),
            },
        };
    }, [heavyDashboardContentReady, hostedRecentData]);

    const localStatusTimeseries = React.useMemo<
        HostedStatusPanelTimeseries | undefined
    >(() => {
        if (!supportsLocalDashboard || !heavyDashboardContentReady) {
            return undefined;
        }
        return toLocalStatusTimeseries({
            segments: localSegmentsQuery.data,
            window: recentWindow,
        });
    }, [
        heavyDashboardContentReady,
        localSegmentsQuery.data,
        recentWindow,
        supportsLocalDashboard,
    ]);

    const summaryAggregate = React.useMemo(
        () =>
            summaryQuery.data
                ? aggregateDashboardSummaries([summaryQuery.data])
                : null,
        [summaryQuery.data],
    );

    const liveAggregate = React.useMemo(
        () =>
            liveQuery.data
                ? toDashboardSummaryAggregateFromLive(liveQuery.data)
                : null,
        [liveQuery.data],
    );

    const interpolatedLiveAggregate = useSmoothedSummaryAggregate(
        liveAggregate,
        dashboardValueAnimationMs,
    );

    const currentCounts = interpolatedLiveAggregate ?? summaryAggregate;
    const totalBytesTransferred = React.useMemo(() => {
        if (!summaryThirtyDayQuery.data) {
            return 0;
        }
        return aggregateDashboardSummaries([summaryThirtyDayQuery.data]).total
            .bytesTransferred;
    }, [summaryThirtyDayQuery.data]);

    const localCurrentCounts =
        React.useMemo<DashboardSummaryAggregate | null>(() => {
            if (!supportsLocalDashboard) {
                return null;
            }
            return toLocalSummaryAggregate(localSegmentsQuery.data);
        }, [localSegmentsQuery.data, supportsLocalDashboard]);

    const localTotalBytesTransferred = React.useMemo(() => {
        if (!supportsLocalDashboard) {
            return 0;
        }
        const breakdown30d = localRegionalBreakdownByWindowQuery.data["30d"];
        const bytesFromRegional =
            sumRegionActivityBytes(breakdown30d.personal) +
            sumRegionActivityBytes(breakdown30d.common);
        if (bytesFromRegional > 0) {
            return bytesFromRegional;
        }
        return sumTransferredFromSegment(
            localSegmentsQuery.data.total,
            "3600000ms",
        );
    }, [
        localRegionalBreakdownByWindowQuery.data,
        localSegmentsQuery.data,
        supportsLocalDashboard,
    ]);
    const regionalBreakdownRows = React.useMemo(
        () =>
            heavyDashboardContentReady && regionalRecentQuery.data
                ? mergeRegionalActivity(
                      regionalRecentQuery.data.personalRegionActivity ?? [],
                      regionalRecentQuery.data.publicRegionActivity ?? [],
                  )
                : [],
        [heavyDashboardContentReady, regionalRecentQuery.data],
    );
    const localRegionalBreakdownRows = React.useMemo(() => {
        if (!supportsLocalDashboard || !heavyDashboardContentReady) {
            return [];
        }
        const windowKey = toLocalRegionalWindowKey(regionalBreakdownWindow);
        const windowBreakdown =
            localRegionalBreakdownByWindowQuery.data[windowKey];
        return mergeRegionalActivity(
            toDashboardRegionMetrics(windowBreakdown.personal),
            toDashboardRegionMetrics(windowBreakdown.common),
        );
    }, [
        localRegionalBreakdownByWindowQuery.data,
        heavyDashboardContentReady,
        regionalBreakdownWindow,
        supportsLocalDashboard,
    ]);
    const localDashboardHasHistory = React.useMemo(
        () =>
            supportsLocalDashboard &&
            hasLocalDashboardHistory(localSegmentsQuery.data),
        [localSegmentsQuery.data, supportsLocalDashboard],
    );
    const lastUpdatedAt =
        liveQuery.data?.generatedAt ??
        regionalRecentQuery.data?.generatedAt ??
        recentQuery.data?.generatedAt ??
        summaryQuery.data?.generatedAt ??
        null;
    const hostedStatsUpdatedAt = lastUpdatedAt;
    const isHostedStatsSyncing =
        shouldPoll &&
        (liveQuery.isFetching ||
            regionalRecentQuery.isFetching ||
            recentQuery.isFetching ||
            summaryQuery.isFetching ||
            summaryThirtyDayQuery.isFetching);
    const dashboardStatsError =
        statsSessionQuery.error ??
        summaryQuery.error ??
        summaryThirtyDayQuery.error ??
        recentQuery.error ??
        regionalRecentQuery.error ??
        liveQuery.error;
    const hasNoAuthorizedTargets =
        statsSessionQuery.isSuccess && !statsSessionQuery.data;
    const hostedInitialStatsReady =
        showingLocalDashboard ||
        !statsEnabled ||
        Boolean(dashboardStatsError) ||
        hasNoAuthorizedTargets ||
        (statsSessionQuery.isSuccess &&
            summaryQuery.isSuccess &&
            summaryThirtyDayQuery.isSuccess &&
            recentQuery.isSuccess &&
            regionalRecentQuery.isSuccess &&
            liveQuery.isSuccess);
    const localInitialStatsReady =
        !showingLocalDashboard ||
        localStatusQuery.data !== "RUNNING" ||
        localActivityStatsReadyQuery.data;
    const dashboardInitialRenderReady =
        dashboardStateResolved &&
        heavyDashboardContentReady &&
        (showingLocalDashboard
            ? localInitialStatsReady
            : hostedInitialStatsReady);

    const statusTimeseries = showingLocalDashboard
        ? localStatusTimeseries
        : hostedStatusTimeseries;
    const dashboardCurrentCounts = showingLocalDashboard
        ? localCurrentCounts
        : currentCounts;
    const dashboardTotalBytesTransferred = showingLocalDashboard
        ? localTotalBytesTransferred
        : totalBytesTransferred;
    const dashboardRegionalRows = showingLocalDashboard
        ? localRegionalBreakdownRows
        : regionalBreakdownRows;
    const dashboardUpdatedAt = showingLocalDashboard
        ? null
        : hostedStatsUpdatedAt;
    const dashboardIsSyncing = showingLocalDashboard
        ? false
        : isHostedStatsSyncing;
    const dashboardPlotReferenceTimeMs = showingLocalDashboard
        ? undefined
        : liveQuery.dataUpdatedAt;
    const dashboardPlotIsLoading = showingLocalDashboard
        ? false
        : recentQuery.isPlaceholderData;
    const dashboardStatusNotice =
        showingLocalDashboard && localStatusQuery.data !== "RUNNING"
            ? localConduitStatus
            : null;
    const dashboardChartNotice =
        showingLocalDashboard &&
        localStatusQuery.data !== "RUNNING" &&
        !localDashboardHasHistory
            ? t("LOCAL_DASHBOARD_HISTORY_START_PROMPT_I18N.string")
            : null;
    const handleLocalDashboardChartNoticePress = React.useCallback(() => {
        if (!showingLocalDashboard || localStatusQuery.data !== "STOPPED") {
            return;
        }
        void toggleInproxy();
    }, [localStatusQuery.data, showingLocalDashboard, toggleInproxy]);

    React.useEffect(() => {
        if (
            supportsLocalDashboard &&
            !hostedAvailable &&
            stationMode === "hosted"
        ) {
            setStationMode("local");
        }
    }, [hostedAvailable, setStationMode, stationMode, supportsLocalDashboard]);

    React.useEffect(() => {
        if (
            rootNavigationState?.key &&
            initialSessionResolved &&
            !canContinue &&
            !supportsLocalDashboard
        ) {
            router.replace("/(app)/hosted-setup");
        }
    }, [
        canContinue,
        initialSessionResolved,
        rootNavigationState?.key,
        router,
        supportsLocalDashboard,
    ]);

    if (!dashboardInitialRenderReady) {
        return <DashboardLoadingScreen width={win.width} height={win.height} />;
    }

    return (
        <View style={{ flex: 1 }}>
            <DashboardBackground width={win.width} height={win.height} />
            <SafeAreaView includeBottomInset={false}>
                <ScrollView
                    ref={scrollViewRef}
                    contentContainerStyle={{
                        flexGrow: 1,
                        paddingTop: 16,
                        paddingBottom: 24,
                        width: "100%",
                        maxWidth: APP_MAX_CONTENT_WIDTH,
                        alignSelf: "center",
                    }}
                >
                    <View
                        style={[ss.column, { gap: 10, paddingHorizontal: 16 }]}
                    >
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 12,
                            }}
                        >
                            <Text style={[ss.extraLargeFont, ss.blackText]}>
                                {t("DASHBOARD_I18N.string")}
                            </Text>
                            {supportsLocalDashboard ? (
                                <DashboardStationSelector
                                    mode={effectiveStationMode}
                                    hostedEnabled={hostedAvailable}
                                    onSelect={setStationMode}
                                    onHostedCta={() =>
                                        router.push("/(app)/hosted-setup")
                                    }
                                />
                            ) : null}
                        </View>
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "flex-end",
                                justifyContent: "space-between",
                                gap: 12,
                            }}
                        >
                            <Text
                                style={[
                                    ss.bodyFont,
                                    ss.blackText,
                                    { fontSize: 34, flexShrink: 1 },
                                ]}
                            >
                                {formatBytes(dashboardTotalBytesTransferred, {
                                    precision: "fixed",
                                    maxUnit: "GB",
                                })}
                                <Text style={[ss.tinyFont, ss.blackText]}>
                                    {" "}
                                    {t("LAST_30D_SUFFIX_I18N.string")}
                                </Text>
                            </Text>
                        </View>
                        {showingLocalDashboard ? (
                            <View
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 8,
                                }}
                            >
                                <Text
                                    style={[
                                        ss.tinyFont,
                                        {
                                            color: palette.midGrey,
                                        },
                                    ]}
                                >
                                    {t("LOCAL_DASHBOARD_STATUS_I18N.string", {
                                        status: localConduitStatus,
                                    })}
                                </Text>
                            </View>
                        ) : (
                            <StatsSyncStatusRow
                                updatedAt={dashboardUpdatedAt}
                                isSyncing={dashboardIsSyncing}
                            />
                        )}
                        <View
                            style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: 8,
                                alignItems: "center",
                            }}
                        >
                            <RecentWindowButton
                                testID="dash-window-5m"
                                label="5m"
                                selected={recentWindow === "5m"}
                                onPress={() => setRecentWindow("5m")}
                            />
                            <RecentWindowButton
                                testID="dash-window-48h"
                                label="48h"
                                selected={recentWindow === "48h"}
                                onPress={() => setRecentWindow("48h")}
                            />
                            <RecentWindowButton
                                testID="dash-window-7d"
                                label="7d"
                                selected={recentWindow === "7d"}
                                onPress={() => setRecentWindow("7d")}
                            />
                            <RecentWindowButton
                                testID="dash-window-30d"
                                label="30d"
                                selected={recentWindow === "30d"}
                                onPress={() => setRecentWindow("30d")}
                            />
                        </View>
                        {!showingLocalDashboard &&
                        !dashboardStatsError &&
                        !hasNoAuthorizedTargets &&
                        !statsSessionQuery.data ? (
                            <Text style={[ss.tinyFont, ss.blackText]}>
                                {t("DASHBOARD_NOT_READY_I18N.string")}
                            </Text>
                        ) : null}

                        {!showingLocalDashboard && dashboardStatsError ? (
                            <Text style={[ss.tinyFont, ss.blackText]}>
                                Error: {toErrorString(dashboardStatsError)}
                            </Text>
                        ) : null}
                        {!showingLocalDashboard && hasNoAuthorizedTargets ? (
                            <Text style={[ss.tinyFont, ss.blackText]}>
                                {t("NO_AUTHORIZED_TARGETS_I18N.string")}
                            </Text>
                        ) : null}
                    </View>

                    {dashboardCurrentCounts && statusTimeseries ? (
                        <>
                            <View
                                style={{
                                    paddingHorizontal: 16,
                                    paddingVertical: 14,
                                }}
                            >
                                <HostedStatusPanel
                                    timeseries={statusTimeseries}
                                    mode={statusMode}
                                    onModeChange={setStatusMode}
                                    statusNotice={dashboardStatusNotice}
                                    chartNotice={dashboardChartNotice}
                                    onChartNoticePress={
                                        dashboardChartNotice &&
                                        localStatusQuery.data === "STOPPED"
                                            ? handleLocalDashboardChartNoticePress
                                            : undefined
                                    }
                                    referenceTimeMs={
                                        dashboardPlotReferenceTimeMs
                                    }
                                    isLoading={dashboardPlotIsLoading}
                                />
                            </View>
                            {dashboardRegionalRows.length > 0 ? (
                                <>
                                    <DashboardSectionDivider />
                                    <View
                                        style={{
                                            paddingHorizontal: 16,
                                            paddingVertical: 14,
                                        }}
                                    >
                                        <RegionalBreakdownPanel
                                            rows={dashboardRegionalRows}
                                            window={regionalBreakdownWindow}
                                        />
                                    </View>
                                    <DashboardSectionDivider />
                                </>
                            ) : null}
                        </>
                    ) : null}

                    {!showingLocalDashboard && conduits.length > 0 ? (
                        <View
                            style={[
                                ss.column,
                                {
                                    gap: 8,
                                    paddingHorizontal: 16,
                                    paddingTop: 12,
                                },
                            ]}
                        >
                            <Pressable
                                testID="dash-conduits-expand"
                                onPress={toggleConduitsExpanded}
                                style={[
                                    ss.row,
                                    {
                                        alignItems: "center",
                                        gap: 6,
                                    },
                                ]}
                            >
                                <Text style={[ss.bodyFont, ss.blackText]}>
                                    {t("YOUR_CONDUITS_I18N.string")}
                                </Text>
                                <Animated.View style={chevronStyle}>
                                    <Icon
                                        name="chevron-down"
                                        size={16}
                                        color={palette.black}
                                    />
                                </Animated.View>
                            </Pressable>
                            {conduitsExpanded ? (
                                <OrbitingConduits
                                    conduits={orderedConduitsForDisplay(
                                        conduits,
                                    )}
                                    currentCounts={dashboardCurrentCounts}
                                    resolveConnectedCount={
                                        resolveConnectedCount
                                    }
                                />
                            ) : null}
                        </View>
                    ) : null}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

function DashboardLoadingScreen({
    width,
    height,
}: {
    width: number;
    height: number;
}) {
    return (
        <View style={{ flex: 1 }}>
            <DashboardBackground width={width} height={height} />
            <SafeAreaView includeBottomInset={false}>
                <View
                    style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <ActivityIndicator size="small" color={palette.black} />
                </View>
            </SafeAreaView>
        </View>
    );
}

function DashboardBackground({
    width,
    height,
}: {
    width: number;
    height: number;
}) {
    return (
        <Canvas
            style={{
                position: "absolute",
                width,
                height,
            }}
        >
            <SkiaRect x={0} y={0} width={width} height={height}>
                <SkiaLinearGradient
                    start={vec(0, height)}
                    end={vec(0, 0)}
                    colors={["#FCDFD7", "#F0E0EB", "#E8DFF2", "#FFFFFF"]}
                    positions={[0.08, 0.19, 0.33, 0.78]}
                />
            </SkiaRect>
        </Canvas>
    );
}

/**
 * Generates a style object for a selectable window button based on selected state.
 */
function buttonStyle(selected?: boolean) {
    return {
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 14,
        minWidth: 68,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        backgroundColor: selected
            ? palette.selectedPurple
            : "rgba(25, 18, 36, 0.08)",
    };
}

function DashboardStationSelector({
    mode,
    hostedEnabled,
    onSelect,
    onHostedCta,
}: {
    mode: DashboardStationMode;
    hostedEnabled: boolean;
    onSelect: (mode: DashboardStationMode) => void;
    onHostedCta: () => void;
}) {
    const { t } = useTranslation();

    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable
                testID="dash-station-local"
                onPress={() => {
                    if (!isE2E()) {
                        Haptics.selectionAsync();
                    }
                    onSelect("local");
                }}
                style={buttonStyle(mode === "local")}
            >
                <Text
                    style={[
                        ss.bodyFont,
                        {
                            color:
                                mode === "local"
                                    ? palette.white
                                    : palette.midGrey,
                            fontSize: 13,
                        },
                    ]}
                >
                    {t("DASHBOARD_LOCAL_STATION_I18N.string")}
                </Text>
            </Pressable>
            <Pressable
                testID="dash-station-hosted"
                disabled={!hostedEnabled}
                onPress={() => {
                    if (!isE2E()) {
                        Haptics.selectionAsync();
                    }
                    onSelect("hosted");
                }}
                style={[
                    buttonStyle(mode === "hosted"),
                    !hostedEnabled ? { opacity: 0.45 } : null,
                ]}
            >
                <Text
                    style={[
                        ss.bodyFont,
                        {
                            color:
                                mode === "hosted"
                                    ? palette.white
                                    : palette.midGrey,
                            fontSize: 13,
                        },
                    ]}
                >
                    {t("DASHBOARD_HOSTED_STATION_I18N.string")}
                </Text>
            </Pressable>
            {!hostedEnabled ? (
                <Pressable
                    onPress={onHostedCta}
                    style={{
                        width: 30,
                        height: 30,
                        borderRadius: 999,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: palette.black,
                    }}
                >
                    <Text
                        style={[
                            ss.bodyFont,
                            {
                                color: palette.white,
                                fontSize: 18,
                                lineHeight: 18,
                                fontWeight: "700",
                            },
                        ]}
                    >
                        +
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}

function DashboardSectionDivider() {
    return (
        <View
            style={{
                borderTopWidth: 1,
                borderTopColor: palette.thinPurple,
                width: "100%",
            }}
        />
    );
}

function RecentWindowButton({
    label,
    selected,
    onPress,
    testID,
}: {
    label: RecentWindow;
    selected: boolean;
    onPress: () => void;
    testID?: string;
}) {
    return (
        <Pressable
            testID={testID}
            style={buttonStyle(selected)}
            onPress={() => {
                if (!isE2E()) {
                    Haptics.selectionAsync();
                }
                onPress();
            }}
        >
            <Text
                style={[
                    ss.bodyFont,
                    {
                        color: selected ? palette.white : palette.midGrey,
                        fontSize: 15,
                    },
                ]}
            >
                {label}
            </Text>
        </Pressable>
    );
}

function useSmoothedSummaryAggregate(
    target: DashboardSummaryAggregate | null,
    durationMs: number,
): DashboardSummaryAggregate | null {
    const [smoothed, setSmoothed] =
        React.useState<DashboardSummaryAggregate | null>(target);
    const latestRef = React.useRef<DashboardSummaryAggregate | null>(target);

    const fromVector = useSharedValue(summaryAggregateToVector(target));
    const toVector = useSharedValue(summaryAggregateToVector(target));
    const progress = useSharedValue(1);

    React.useEffect(() => {
        latestRef.current = smoothed;
    }, [smoothed]);

    React.useEffect(() => {
        if (!target) {
            latestRef.current = null;
            setSmoothed(null);
            return;
        }

        const baseline = latestRef.current ?? target;
        fromVector.value = summaryAggregateToVector(baseline);
        toVector.value = summaryAggregateToVector(target);

        cancelAnimation(progress);
        progress.value = 0;
        progress.value = withTiming(1, {
            duration: Math.max(300, Math.floor(durationMs * 0.85)),
        });
    }, [durationMs, fromVector, progress, target, toVector]);

    useAnimatedReaction(
        () => {
            const t =
                progress.value < 0
                    ? 0
                    : progress.value > 1
                      ? 1
                      : progress.value;
            return (
                Math.round(t * SUMMARY_ANIMATION_STEPS) /
                SUMMARY_ANIMATION_STEPS
            );
        },
        (step, previousStep) => {
            if (step === previousStep) {
                return;
            }
            const value = interpolateSummaryVector(
                fromVector.value,
                toVector.value,
                step,
            );
            runOnJS(setSmoothed)(summaryVectorToAggregate(value));
        },
    );

    return smoothed;
}

function RegionalBreakdownPanel({
    rows,
    window,
}: {
    rows: RegionalImpactRow[];
    window: RecentWindow;
}) {
    const { t } = useTranslation();
    const [detailsVisible, setDetailsVisible] = React.useState(false);
    const [detailsContentReady, setDetailsContentReady] = React.useState(false);

    const sortedRows = React.useMemo(() => {
        return [...rows].sort(
            (left, right) => right.bytesTransferred - left.bytesTransferred,
        );
    }, [rows]);
    const visibleRows = React.useMemo(
        () =>
            sortedRows.filter((row) => {
                const region = row.region.trim();

                return region.length !== 2 || supportsRegionalMapRegion(region);
            }),
        [sortedRows],
    );

    React.useEffect(() => {
        if (!detailsVisible) {
            setDetailsContentReady(false);
            return;
        }

        let cancelled = false;
        let released = false;
        let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
        const releaseDetails = () => {
            if (cancelled || released) {
                return;
            }
            released = true;
            if (fallbackTimer) {
                clearTimeout(fallbackTimer);
            }
            setDetailsContentReady(true);
        };
        const task = InteractionManager.runAfterInteractions(() => {
            releaseDetails();
        });
        fallbackTimer = setTimeout(() => {
            releaseDetails();
        }, 250);

        return () => {
            cancelled = true;
            task.cancel();
            if (fallbackTimer) {
                clearTimeout(fallbackTimer);
            }
        };
    }, [detailsVisible]);

    return (
        <>
            <View style={[ss.column, { gap: 10 }]}>
                <Text style={[ss.largeFont, ss.blackText, ss.centeredText]}>
                    {t("WHO_ARE_YOU_HELPING_I18N.string")}
                </Text>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(
                        "OPEN_REGIONAL_BREAKDOWN_I18N.string",
                    )}
                    onPress={() => setDetailsVisible(true)}
                    style={{ gap: 8 }}
                >
                    <RegionalWorldMap rows={visibleRows} />
                    <Text
                        style={[
                            ss.tinyFont,
                            ss.centeredText,
                            {
                                color: palette.midGrey,
                            },
                        ]}
                    >
                        {t("TAP_MAP_FOR_COUNTRY_DETAILS_I18N.string")}
                    </Text>
                </Pressable>
            </View>
            <Modal
                animationType="fade"
                navigationBarTranslucent={Platform.OS === "android"}
                onRequestClose={() => setDetailsVisible(false)}
                presentationStyle="overFullScreen"
                statusBarTranslucent={Platform.OS === "android"}
                transparent={true}
                visible={detailsVisible}
            >
                <RegionalBreakdownModal
                    isLoading={!detailsContentReady}
                    onClose={() => setDetailsVisible(false)}
                    rows={visibleRows}
                    window={window}
                />
            </Modal>
        </>
    );
}

function RegionalBreakdownModal({
    isLoading,
    onClose,
    rows,
    window,
}: {
    isLoading: boolean;
    onClose: () => void;
    rows: RegionalImpactRow[];
    window: RecentWindow;
}) {
    const { i18n, t } = useTranslation();
    const visibleRows = React.useMemo(
        () =>
            [...rows]
                .sort(
                    (left, right) =>
                        right.bytesTransferred - left.bytesTransferred,
                )
                .slice(0, 16),
        [rows],
    );
    const maxBytesTransferred = visibleRows.reduce(
        (currentMax, row) => Math.max(currentMax, row.bytesTransferred),
        0,
    );
    const minPositiveBytesTransferred = visibleRows.reduce(
        (currentMin, row) =>
            row.bytesTransferred > 0
                ? Math.min(currentMin, row.bytesTransferred)
                : currentMin,
        Number.POSITIVE_INFINITY,
    );
    const boundedMinPositiveBytesTransferred = Number.isFinite(
        minPositiveBytesTransferred,
    )
        ? minPositiveBytesTransferred
        : 0;

    return (
        <Pressable
            onPress={onClose}
            style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                paddingHorizontal: 20,
                backgroundColor: "rgba(0, 0, 0, 0.16)",
            }}
        >
            <Pressable
                onPress={(event) => {
                    event.stopPropagation();
                }}
                style={{
                    width: "100%",
                    maxWidth: 560,
                    maxHeight: "80%",
                    backgroundColor: palette.white,
                    borderRadius: 18,
                    overflow: "hidden",
                }}
            >
                <View
                    style={{
                        padding: 16,
                        gap: 14,
                    }}
                >
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                        }}
                    >
                        <View style={{ flex: 1, gap: 4 }}>
                            <Text style={[ss.largeFont, ss.blackText]}>
                                {t("WHO_ARE_YOU_HELPING_I18N.string")}
                            </Text>
                            <Text style={[ss.tinyFont, ss.blackText]}>
                                {t("REGIONAL_ACTIVITY_BY_BYTES_I18N.string", {
                                    metric: t(
                                        "BYTES_TRANSFERRED_LABEL_I18N.string",
                                    ),
                                    window,
                                })}
                            </Text>
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t(
                                "CLOSE_CONDUIT_DETAILS_ACCESSIBILITY_I18N.string",
                            )}
                            hitSlop={10}
                            onPress={onClose}
                        >
                            <Icon
                                name="close"
                                color={palette.lightGrey}
                                size={22}
                            />
                        </Pressable>
                    </View>
                    {isLoading ? (
                        <View
                            style={{
                                minHeight: 220,
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <ActivityIndicator
                                size="small"
                                color={palette.midGrey}
                            />
                        </View>
                    ) : (
                        <View
                            style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: 10,
                            }}
                        >
                            {visibleRows.map((row) => {
                                const value = row.bytesTransferred;

                                return (
                                    <View
                                        key={`bytes-${row.region}`}
                                        style={{
                                            width: "48%",
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 12,
                                            paddingVertical: 2,
                                        }}
                                    >
                                        <RegionalMapGlyph
                                            bytesTransferred={value}
                                            minPositiveBytesTransferred={
                                                boundedMinPositiveBytesTransferred
                                            }
                                            maxBytesTransferred={
                                                maxBytesTransferred
                                            }
                                            region={row.region}
                                        />
                                        <View
                                            style={{
                                                flex: 1,
                                                gap: 2,
                                            }}
                                        >
                                            <Text
                                                numberOfLines={1}
                                                style={[
                                                    ss.bodyFont,
                                                    ss.blackText,
                                                    { fontSize: 16 },
                                                ]}
                                            >
                                                {toRegionLabel(
                                                    row.region,
                                                    i18n.language,
                                                )}
                                            </Text>
                                            <Text
                                                numberOfLines={1}
                                                style={[
                                                    ss.tinyFont,
                                                    ss.blackText,
                                                    {
                                                        fontSize: 13,
                                                        opacity: 0.62,
                                                    },
                                                ]}
                                            >
                                                {formatBytes(value, {
                                                    precision: "fixed",
                                                    maxUnit: "GB",
                                                })}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </View>
            </Pressable>
        </Pressable>
    );
}

const ORBIT_RADIUS = 10;
const ORBIT_DURATION_MS = 6000;

function OrbitingConduits({
    conduits,
    currentCounts,
    resolveConnectedCount: resolve,
}: {
    conduits: ConduitView[];
    currentCounts: DashboardSummaryAggregate | null;
    resolveConnectedCount: (
        conduit: ConduitView,
        counts: DashboardSummaryAggregate | null,
    ) => number;
}) {
    const progress = useSharedValue(0);

    React.useEffect(() => {
        progress.value = withRepeat(
            withTiming(1, {
                duration: ORBIT_DURATION_MS,
                easing: Easing.linear,
            }),
            -1,
            false,
        );
    }, [progress]);

    return (
        <View
            style={{
                flexDirection: "row",
                justifyContent: "center",
                paddingVertical: ORBIT_RADIUS,
            }}
        >
            {conduits.map((conduit, index) => (
                <OrbitingCard
                    key={conduit.conduit_id}
                    conduit={conduit}
                    connectedCount={resolve(conduit, currentCounts)}
                    progress={progress}
                    phaseOffset={index * Math.PI}
                />
            ))}
        </View>
    );
}

function OrbitingCard({
    conduit,
    connectedCount,
    progress,
    phaseOffset,
}: {
    conduit: ConduitView;
    connectedCount: number;
    progress: Animated.SharedValue<number>;
    phaseOffset: number;
}) {
    const angle = useDerivedValue(
        () => progress.value * 2 * Math.PI + phaseOffset,
    );

    const orbitStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: Math.cos(angle.value) * ORBIT_RADIUS },
            { translateY: Math.sin(angle.value) * ORBIT_RADIUS },
        ],
    }));

    return (
        <View style={{ flex: 1, alignItems: "center" }}>
            <HostedConduitCard
                conduit={conduit}
                connectedCount={connectedCount}
                orbStyle={orbitStyle}
            />
        </View>
    );
}

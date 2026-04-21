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
import { useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    AppState,
    AppStateStatus,
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

import { toErrorString } from "@/src/common/errors";
import { formatBytesWithUnit } from "@/src/common/formatters";
import { HostedConduitCard } from "@/src/components/HostedConduitCard";
import {
    HostedStatusPanel,
    HostedStatusPanelTimeseries,
} from "@/src/components/HostedStatusPanel";
import { Icon } from "@/src/components/Icon";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { StatsSyncStatusRow } from "@/src/components/StatsSyncStatusRow";
import { TimeseriesDataPoint } from "@/src/components/TimeseriesPlot";
import {
    ASYNCSTORAGE_DASHBOARD_RECENT_WINDOW_KEY,
    ASYNCSTORAGE_DASHBOARD_STATION_MODE_KEY,
} from "@/src/constants";
import { createHostedClient } from "@/src/hosted/client";
import {
    orderedConduitsForDisplay,
    resolveConnectedCount,
} from "@/src/hosted/conduitDisplay";
import { readHostedRuntimeConfig } from "@/src/hosted/config";
import { ConduitView, RecentWindow } from "@/src/hosted/contracts";
import {
    DashboardLiveRegionMetric,
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
} from "@/src/hosted/dashboard";
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
import {
    buildMockDashboardLiveData,
    buildMockDashboardRecentData,
    buildMockDashboardSummaryData,
} from "@/src/hosted/dashboard/mockData";
import {
    RegionalImpactRow,
    mergeRegionalActivity,
    toRegionLabel,
} from "@/src/hosted/dashboard/regional";
import {
    buttonStyle,
    toRegionalBreakdownWindow,
    toSummaryWindow,
} from "@/src/hosted/dashboard/windowMapping";
import { useHostedExperienceState } from "@/src/hosted/experience/hooks";
import { shouldRouteToHostedActiveExperience } from "@/src/hosted/experience/navigation";
import { HostedStatsDataSource } from "@/src/hosted/queryKeys";
import { createHostedSessionClient } from "@/src/hosted/sessionClient";
import {
    useHostedStatsLiveQuery,
    useHostedStatsRecentQuery,
    useHostedStatsSessionQuery,
    useHostedStatsSummaryQuery,
} from "@/src/hosted/statsQueries";
import {
    useInproxyActivitySegments,
    useInproxyRegionalBreakdownByWindow,
    useInproxyStatus,
} from "@/src/inproxy/hooks";
import {
    InproxyActivityByPeriod,
    InproxyActivityRegion,
    InproxyActivitySegment,
    InproxyActivitySegments,
    InproxyRegionalBreakdownByWindow,
} from "@/src/inproxy/types";
import { palette, sharedStyles as ss } from "@/src/styles";

type DashboardStationMode = "hosted" | "local";
const SUMMARY_ANIMATION_STEPS = 12;

export default function HostedDashboardScreen() {
    const router = useRouter();
    const win = useWindowDimensions();
    const state = useHostedExperienceState();
    const config = React.useMemo(readHostedRuntimeConfig, []);
    const isFocused = useIsFocused();
    const { t } = useTranslation();
    const supportsLocalDashboard = Platform.OS === "android";

    const [recentWindow, setRecentWindowState] =
        React.useState<RecentWindow>("5m");
    const [stationMode, setStationModeState] =
        React.useState<DashboardStationMode>("hosted");
    const [windowResolved, setWindowResolved] = React.useState(false);
    const [stationModeResolved, setStationModeResolved] = React.useState(
        !supportsLocalDashboard,
    );
    const setRecentWindow = React.useCallback((window: RecentWindow) => {
        setRecentWindowState(window);
        void AsyncStorage.setItem(
            ASYNCSTORAGE_DASHBOARD_RECENT_WINDOW_KEY,
            window,
        );
    }, []);
    const [statsDataSource, setStatsDataSource] =
        React.useState<HostedStatsDataSource>("api");
    const [appState, setAppState] = React.useState<AppStateStatus>(
        AppState.currentState,
    );
    const [heavyContentReady, setHeavyContentReady] = React.useState(true);
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
    const shouldPoll = isFocused && appState === "active";
    const usingMockStats = __DEV__ && statsDataSource === "mock";
    const livePollIntervalMs = 10_000;
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

    const hostedClient = React.useMemo(() => {
        return createHostedClient({ baseUrl: config.baseUrl });
    }, [config.baseUrl]);
    const sessionClient = React.useMemo(
        () => createHostedSessionClient({ baseUrl: config.baseUrl }),
        [config.baseUrl],
    );
    const statsDeps = React.useMemo(
        () => ({
            baseUrl: config.baseUrl,
            now: () => Date.now(),
            sessionClient,
            hostedClient,
            dataSource: statsDataSource,
        }),
        [config.baseUrl, hostedClient, sessionClient, statsDataSource],
    );
    const dashboardStateResolved = windowResolved && stationModeResolved;
    const statsEnabled =
        dashboardStateResolved && canContinue && Boolean(config.baseUrl);
    const statsSessionQuery = useHostedStatsSessionQuery(
        statsDeps,
        statsEnabled,
    );
    const summaryQuery = useHostedStatsSummaryQuery(
        statsDeps,
        statsSessionQuery.data,
        summaryWindow,
        statsEnabled,
        usingMockStats
            ? async () => buildMockDashboardSummaryData(summaryWindow)
            : undefined,
    );
    const summaryThirtyDayQuery = useHostedStatsSummaryQuery(
        statsDeps,
        statsSessionQuery.data,
        "30d",
        statsEnabled,
        usingMockStats
            ? async () => buildMockDashboardSummaryData("30d")
            : undefined,
    );
    const recentQuery = useHostedStatsRecentQuery(
        statsDeps,
        statsSessionQuery.data,
        recentWindow,
        statsEnabled,
        shouldPoll
            ? usingMockStats
                ? 5_000
                : recentWindow === "5m"
                  ? 10_000
                  : 60_000
            : false,
        usingMockStats
            ? async () => buildMockDashboardRecentData(recentWindow)
            : undefined,
    );
    const regionalRecentQuery = useHostedStatsRecentQuery(
        statsDeps,
        statsSessionQuery.data,
        regionalBreakdownWindow,
        statsEnabled,
        shouldPoll
            ? usingMockStats
                ? 5_000
                : regionalBreakdownWindow === "5m"
                  ? 10_000
                  : 60_000
            : false,
        usingMockStats
            ? async () => buildMockDashboardRecentData(regionalBreakdownWindow)
            : undefined,
    );
    const liveQuery = useHostedStatsLiveQuery(
        statsDeps,
        statsSessionQuery.data,
        statsEnabled,
        shouldPoll ? livePollIntervalMs : false,
        usingMockStats ? async () => buildMockDashboardLiveData() : undefined,
    );

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
            summaryQuery.isFetching);

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
        if (!canContinue && !supportsLocalDashboard) {
            router.replace("/(app)/hosted-setup");
        }
    }, [canContinue, router, supportsLocalDashboard]);

    React.useEffect(() => {
        const subscription = AppState.addEventListener("change", setAppState);
        return () => {
            subscription.remove();
        };
    }, []);

    if (!dashboardStateResolved) {
        return (
            <View
                style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#FFFFFF",
                }}
            >
                <ActivityIndicator size="small" color={palette.black} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            <Canvas
                style={{
                    position: "absolute",
                    width: win.width,
                    height: win.height,
                }}
            >
                <SkiaRect x={0} y={0} width={win.width} height={win.height}>
                    <SkiaLinearGradient
                        start={vec(0, win.height)}
                        end={vec(0, 0)}
                        colors={["#FCDFD7", "#F0E0EB", "#E8DFF2", "#FFFFFF"]}
                        positions={[0.08, 0.19, 0.33, 0.78]}
                    />
                </SkiaRect>
            </Canvas>
            <SafeAreaView includeBottomInset={false}>
                <ScrollView
                    ref={scrollViewRef}
                    contentContainerStyle={{
                        paddingTop: 16,
                        paddingBottom: 24,
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
                                {formatBytesWithUnit(
                                    dashboardTotalBytesTransferred,
                                )}
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
                                label="5m"
                                selected={recentWindow === "5m"}
                                onPress={() => setRecentWindow("5m")}
                            />
                            <RecentWindowButton
                                label="48h"
                                selected={recentWindow === "48h"}
                                onPress={() => setRecentWindow("48h")}
                            />
                            <RecentWindowButton
                                label="7d"
                                selected={recentWindow === "7d"}
                                onPress={() => setRecentWindow("7d")}
                            />
                            <RecentWindowButton
                                label="30d"
                                selected={recentWindow === "30d"}
                                onPress={() => setRecentWindow("30d")}
                            />
                        </View>
                        {!showingLocalDashboard && usingMockStats ? (
                            <Text style={[ss.tinyFont, ss.blackText]}>
                                DEV: using mock stats source.
                            </Text>
                        ) : !showingLocalDashboard &&
                          statsSessionQuery.data ? null : !showingLocalDashboard ? (
                            <Text style={[ss.tinyFont, ss.blackText]}>
                                {t("DASHBOARD_NOT_READY_I18N.string")}
                            </Text>
                        ) : null}

                        {!showingLocalDashboard &&
                        statsSessionQuery.error &&
                        !usingMockStats ? (
                            <Text style={[ss.tinyFont, ss.blackText]}>
                                Error: {toErrorString(statsSessionQuery.error)}
                            </Text>
                        ) : null}
                        {!showingLocalDashboard &&
                        (summaryQuery.error ||
                            recentQuery.error ||
                            liveQuery.error) ? (
                            <Text style={[ss.tinyFont, ss.blackText]}>
                                Error:{" "}
                                {toErrorString(
                                    summaryQuery.error ??
                                        recentQuery.error ??
                                        liveQuery.error,
                                )}
                            </Text>
                        ) : null}
                        {!showingLocalDashboard &&
                        statsSessionQuery.isSuccess &&
                        !statsSessionQuery.data &&
                        !usingMockStats ? (
                            <Text style={[ss.tinyFont, ss.blackText]}>
                                {t("NO_AUTHORIZED_TARGETS_I18N.string")}
                            </Text>
                        ) : null}
                    </View>

                    {!heavyDashboardContentReady ? (
                        <DashboardHeavyContentPlaceholder />
                    ) : dashboardCurrentCounts && statusTimeseries ? (
                        <>
                            <View
                                style={{
                                    paddingHorizontal: 16,
                                    paddingVertical: 14,
                                }}
                            >
                                <HostedStatusPanel
                                    timeseries={statusTimeseries}
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

                    {heavyDashboardContentReady &&
                    !showingLocalDashboard &&
                    conduits.length > 0 ? (
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

                    {supportsLocalDashboard && !hostedAvailable ? (
                        <View
                            style={{
                                paddingHorizontal: 16,
                                paddingTop: 12,
                            }}
                        >
                            <Pressable
                                onPress={() =>
                                    router.push("/(app)/hosted-setup")
                                }
                                style={{
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: palette.deepMauve,
                                    backgroundColor: "rgba(255,255,255,0.72)",
                                    paddingHorizontal: 14,
                                    paddingVertical: 12,
                                }}
                            >
                                <Text
                                    style={[
                                        ss.bodyFont,
                                        ss.blackText,
                                        {
                                            textAlign: "center",
                                            fontWeight: "700",
                                        },
                                    ]}
                                >
                                    + {t("HOST_A_STATION_I18N.string")}
                                </Text>
                            </Pressable>
                        </View>
                    ) : null}

                    {__DEV__ && false ? (
                        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                            <DevStatsDataSourceToggle
                                source={statsDataSource}
                                onChange={setStatsDataSource}
                            />
                        </View>
                    ) : null}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

function toLocalRegionalWindowKey(
    window: RecentWindow,
): keyof InproxyRegionalBreakdownByWindow {
    switch (window) {
        case "7d":
            return "7d";
        case "30d":
            return "30d";
        case "48h":
            return "48h";
        case "5m":
        default:
            return "48h";
    }
}

function toDashboardRegionMetrics(
    regionActivity: InproxyActivityRegion[],
): DashboardLiveRegionMetric[] {
    return regionActivity.map((region) => ({
        region: region.region,
        connectedUsers: region.connectedClients,
        connectingUsers: region.connectingClients,
        bytesUpTotal: region.bytesUp,
        bytesDownTotal: region.bytesDown,
    }));
}

function toLocalStatusTimeseries(input: {
    segments: InproxyActivitySegments;
    window: RecentWindow;
}): HostedStatusPanelTimeseries {
    const periodKey = input.window === "5m" ? "1000ms" : "3600000ms";
    const periodMs = periodKey === "1000ms" ? 1_000 : 3_600_000;
    const nowMs = Date.now();
    const personal = slicePeriodToWindow(
        getSegmentPeriod(input.segments.personal, periodKey),
        input.window,
        periodKey,
    );
    const common = slicePeriodToWindow(
        getSegmentPeriod(input.segments.common, periodKey),
        input.window,
        periodKey,
    );

    return {
        bytesTransferred: {
            personal: toTimeseriesPoints(
                combineTransferred(personal),
                periodMs,
                nowMs,
            ),
            public: toTimeseriesPoints(
                combineTransferred(common),
                periodMs,
                nowMs,
            ),
        },
        connectedUsers: {
            personal: toTimeseriesPoints(
                personal.connectedClients,
                periodMs,
                nowMs,
            ),
            public: toTimeseriesPoints(
                common.connectedClients,
                periodMs,
                nowMs,
            ),
        },
        connectingUsers: {
            personal: toTimeseriesPoints(
                personal.connectingClients,
                periodMs,
                nowMs,
            ),
            public: toTimeseriesPoints(
                common.connectingClients,
                periodMs,
                nowMs,
            ),
        },
    };
}

function getSegmentPeriod(
    segment: InproxyActivitySegment,
    period: "1000ms" | "3600000ms",
): InproxyActivityByPeriod {
    if (period === "1000ms") {
        return segment.dataByPeriod["1000ms"];
    }

    const hourly = segment.dataByPeriod["3600000ms"];
    if (hourly) {
        return hourly;
    }

    const numBuckets = 720;
    return {
        bytesUp: new Array(numBuckets).fill(0),
        bytesDown: new Array(numBuckets).fill(0),
        announcingWorkers: new Array(numBuckets).fill(0),
        connectingClients: new Array(numBuckets).fill(0),
        connectedClients: new Array(numBuckets).fill(0),
        numBuckets,
    };
}

function slicePeriodToWindow(
    period: InproxyActivityByPeriod,
    window: RecentWindow,
    periodKey: "1000ms" | "3600000ms",
): InproxyActivityByPeriod {
    const maxBuckets = localWindowBucketCount(window, periodKey);
    if (maxBuckets >= period.numBuckets) {
        return period;
    }

    return {
        bytesUp: sliceTail(period.bytesUp, maxBuckets),
        bytesDown: sliceTail(period.bytesDown, maxBuckets),
        announcingWorkers: sliceTail(period.announcingWorkers, maxBuckets),
        connectingClients: sliceTail(period.connectingClients, maxBuckets),
        connectedClients: sliceTail(period.connectedClients, maxBuckets),
        numBuckets: maxBuckets,
    };
}

function localWindowBucketCount(
    window: RecentWindow,
    periodKey: "1000ms" | "3600000ms",
): number {
    if (periodKey === "1000ms") {
        return 300;
    }

    switch (window) {
        case "48h":
            return 48;
        case "7d":
            return 7 * 24;
        case "30d":
            return 30 * 24;
        case "5m":
        default:
            return 48;
    }
}

function sliceTail(values: number[], count: number): number[] {
    if (count <= 0) {
        return [];
    }
    if (values.length <= count) {
        return values;
    }
    return values.slice(values.length - count);
}

function toTimeseriesPoints(
    values: number[],
    periodMs: number,
    nowMs: number,
): TimeseriesDataPoint[] {
    if (values.length === 0) {
        return [];
    }
    const startMs = nowMs - (values.length - 1) * periodMs;
    return values.map((value, index) => ({
        time: new Date(startMs + index * periodMs),
        value,
    }));
}

function combineTransferred(period: InproxyActivityByPeriod): number[] {
    const size = Math.min(period.bytesUp.length, period.bytesDown.length);
    const output = new Array<number>(size);
    for (let index = 0; index < size; index += 1) {
        output[index] = period.bytesUp[index] + period.bytesDown[index];
    }
    return output;
}

function toLocalSummaryAggregate(
    segments: InproxyActivitySegments,
): DashboardSummaryAggregate {
    const personal = {
        connectedUsers: segments.personal.currentConnectedClients,
        connectingUsers: segments.personal.currentConnectingClients,
        bytesTransferred:
            segments.personal.totalBytesUp + segments.personal.totalBytesDown,
    };
    const publicSegment = {
        connectedUsers: segments.common.currentConnectedClients,
        connectingUsers: segments.common.currentConnectingClients,
        bytesTransferred:
            segments.common.totalBytesUp + segments.common.totalBytesDown,
    };

    return {
        personal,
        public: publicSegment,
        total: {
            connectedUsers:
                segments.total.currentConnectedClients ||
                personal.connectedUsers + publicSegment.connectedUsers,
            connectingUsers:
                segments.total.currentConnectingClients ||
                personal.connectingUsers + publicSegment.connectingUsers,
            bytesTransferred:
                segments.total.totalBytesUp + segments.total.totalBytesDown,
        },
    };
}

function sumTransferredFromSegment(
    segment: InproxyActivitySegment,
    period: "1000ms" | "3600000ms",
): number {
    const buckets = getSegmentPeriod(segment, period);
    const size = Math.min(buckets.bytesUp.length, buckets.bytesDown.length);
    let sum = 0;
    for (let index = 0; index < size; index += 1) {
        sum += buckets.bytesUp[index] + buckets.bytesDown[index];
    }
    return sum;
}

function sumRegionActivityBytes(regions: InproxyActivityRegion[]): number {
    let sum = 0;
    for (const region of regions) {
        sum += region.bytesUp + region.bytesDown;
    }
    return sum;
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
                onPress={() => {
                    Haptics.selectionAsync();
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
                disabled={!hostedEnabled}
                onPress={() => {
                    Haptics.selectionAsync();
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

function DevStatsDataSourceToggle({
    source,
    onChange,
}: {
    source: HostedStatsDataSource;
    onChange: (source: HostedStatsDataSource) => void;
}) {
    const apiSelected = source === "api";
    const mockSelected = source === "mock";

    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "flex-start",
                borderWidth: 1,
                borderColor: palette.thinPurple,
                borderRadius: 999,
                overflow: "hidden",
                backgroundColor: "rgba(255, 255, 255, 0.4)",
            }}
        >
            <Text
                style={[
                    ss.tinyFont,
                    ss.blackText,
                    { paddingLeft: 10, paddingRight: 6 },
                ]}
            >
                Stats
            </Text>
            <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: apiSelected }}
                onPress={() => {
                    onChange("api");
                }}
                style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderLeftWidth: 1,
                    borderLeftColor: palette.thinPurple,
                    backgroundColor: apiSelected
                        ? palette.purple
                        : palette.white,
                }}
            >
                <Text
                    style={[
                        ss.tinyFont,
                        apiSelected ? ss.whiteText : ss.blackText,
                    ]}
                >
                    API
                </Text>
            </Pressable>
            <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: mockSelected }}
                onPress={() => {
                    onChange("mock");
                }}
                style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderLeftWidth: 1,
                    borderLeftColor: palette.thinPurple,
                    backgroundColor: mockSelected
                        ? palette.purple
                        : palette.white,
                }}
            >
                <Text
                    style={[
                        ss.tinyFont,
                        mockSelected ? ss.whiteText : ss.blackText,
                    ]}
                >
                    Mock
                </Text>
            </Pressable>
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

function DashboardHeavyContentPlaceholder() {
    return (
        <View
            style={{
                paddingHorizontal: 16,
                paddingVertical: 14,
            }}
        >
            <View
                style={{
                    borderRadius: 12,
                    backgroundColor: "rgba(25, 18, 36, 0.04)",
                    minHeight: 260,
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <ActivityIndicator size="small" color={palette.midGrey} />
            </View>
        </View>
    );
}

function RecentWindowButton({
    label,
    selected,
    onPress,
}: {
    label: RecentWindow;
    selected: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            style={buttonStyle(selected)}
            onPress={() => {
                Haptics.selectionAsync();
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
                        {
                            defaultValue: "Open regional breakdown",
                        },
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
                        {t("TAP_MAP_FOR_COUNTRY_DETAILS_I18N.string", {
                            defaultValue:
                                "Tap the map for the country breakdown.",
                        })}
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
    const { t } = useTranslation();
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
                                    defaultValue:
                                        "Regional activity by {{metric}} in {{window}}",
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
                                                {toRegionLabel(row.region)}
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
                                                {formatBytesWithUnit(value)}
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

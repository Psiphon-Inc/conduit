/*
 * Copyright (c) 2024, Psiphon Inc.
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
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    AppState,
    AppStateStatus,
    InteractionManager,
    Platform,
    View,
    useWindowDimensions,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useConduitKeyPair } from "@/src/auth/hooks";
import { formatExpiresAt } from "@/src/common/formatters";
import { ActionsArea } from "@/src/components/ActionsArea";
import { useConduitActions } from "@/src/components/ConduitActionsContext";
import { ConduitStatus } from "@/src/components/ConduitStatus";
import { HostedConduitModal } from "@/src/components/HostedConduitModal";
import { LocalConduitModal } from "@/src/components/LocalConduitModal";
import { LogoWordmark } from "@/src/components/LogoWordmark";
import { useModal } from "@/src/components/ModalStore";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { SkyBox, SkyBoxGradientState } from "@/src/components/SkyBox";
import { StatsSyncStatusRow } from "@/src/components/StatsSyncStatusRow";
import {
    OrbEvolutionLevel,
    OrbScene,
    OrbSceneActivityLane,
    OrbSceneHostedOrbPressEvent,
    OrbVisualMode,
} from "@/src/components/orb-scene/OrbScene";
import {
    resolveEvolutionLevel,
    toOrbLevelFromCount,
} from "@/src/components/orb-scene/orbUtils";
import { useConduitName } from "@/src/hooks";
import { createHostedClient } from "@/src/hosted/client";
import {
    resolveHostedConduitBytes,
    resolveHostedConduitConnectedCount,
} from "@/src/hosted/conduitDisplay";
import { readHostedRuntimeConfig } from "@/src/hosted/config";
import {
    DashboardRecentAggregate,
    DashboardSummaryAggregate,
} from "@/src/hosted/dashboard";
import {
    HostedCallToActionMode,
    resolveHostedCallToActionMode,
} from "@/src/hosted/experience/homeCallToAction";
import {
    useHostedExperienceInitialSessionResolved,
    useHostedExperienceLastAuthProvider,
    useHostedExperienceSnapshotBootstrapPending,
    useHostedExperienceState,
} from "@/src/hosted/experience/hooks";
import { isEntitlementAllowed } from "@/src/hosted/experience/stateMachine";
import { createHostedSessionClient } from "@/src/hosted/sessionClient";
import { useHostedHomeWidgetStats } from "@/src/hosted/statsQueries";
import { useInproxyContext } from "@/src/inproxy/context";
import {
    useInproxyActivityStatsReady,
    useInproxyCurrentCommonConnectedClients,
    useInproxyCurrentConnectedClients,
    useInproxyCurrentPersonalConnectedClients,
    useInproxyMustUpgrade,
    useInproxyStatus,
    useInproxyTotalBytesTransferred,
} from "@/src/inproxy/hooks";
import { getProxyId } from "@/src/inproxy/utils";

interface OrbHostedTrack {
    id: string;
    connectedCount: number;
}

export default function HomeScreen() {
    const router = useRouter();
    const isFocused = useIsFocused();
    const win = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const runtimeConfig = React.useMemo(readHostedRuntimeConfig, []);
    const conduitKeyPair = useConduitKeyPair();
    const state = useHostedExperienceState();
    const initialSessionResolved = useHostedExperienceInitialSessionResolved();
    const hostedSnapshotBootstrapPending =
        useHostedExperienceSnapshotBootstrapPending();
    const lastAuthProvider = useHostedExperienceLastAuthProvider();
    const { data: conduitName } = useConduitName();
    const { isPersonalPairingReady, toggleInproxy } = useInproxyContext();
    const { data: inproxyStatus } = useInproxyStatus();
    const { data: inproxyMustUpgrade } = useInproxyMustUpgrade();
    const { data: localActivityStatsReady } = useInproxyActivityStatsReady();
    const { data: localConnectedPeers } = useInproxyCurrentConnectedClients();
    const { data: localPublicConnected } =
        useInproxyCurrentCommonConnectedClients();
    const { data: localPersonalConnected } =
        useInproxyCurrentPersonalConnectedClients();
    const { data: localTotalBytesTransferred } =
        useInproxyTotalBytesTransferred();
    const { t } = useTranslation();
    const { openModal, closeModal, isOpen: bgBlur } = useModal();
    const { openPersonalPairingModal } = useConduitActions();
    const [orbHint, setOrbHint] = React.useState<string | null>(null);
    const [selectedHostedConduitId, setSelectedHostedConduitId] =
        React.useState<string | null>(null);
    const [preferredMainConduitId, setPreferredMainConduitId] = React.useState<
        string | null
    >(null);
    const [heavyContentReady, setHeavyContentReady] = React.useState(false);
    const orbHintTimeoutRef = React.useRef<ReturnType<
        typeof setTimeout
    > | null>(null);

    const totalUsableHeight = win.height - (insets.top + insets.bottom);
    const totalUsableWidth = win.width;
    const logoHeight = totalUsableHeight * 0.06;
    const orbSceneHeight = totalUsableHeight * 0.45;
    const actionsAreaHeight = totalUsableHeight * 0.2;

    React.useEffect(() => {
        if (!isFocused) {
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
    }, [isFocused]);

    const conduits = state.conduitsSnapshot?.conduits ?? [];
    const hasHostedSession =
        state.authPhase === "authenticated" && state.session != null;
    const hasConduitsSnapshot = state.conduitsSnapshot != null;

    const entitlementAllowed = isEntitlementAllowed(state.entitlementSnapshot);
    const hostedCallToAction = resolveHostedCallToActionMode({
        initialSessionResolved,
        hasHostedSession,
        hasConduitsSnapshot,
        hostedSnapshotBootstrapPending:
            hostedSnapshotBootstrapPending &&
            hasHostedSession &&
            !hasConduitsSnapshot &&
            state.stationError == null,
        entitlementAllowed,
        entitlementSnapshot: state.entitlementSnapshot,
        stationPhase: state.stationPhase,
        conduits,
    });
    const { hasActiveHostedConduit, isHostedEntitlementResolving } =
        hostedCallToAction;
    const hostedCallToActionMode: HostedCallToActionMode =
        hostedCallToAction.mode;

    const showLocalExperience = Platform.OS !== "ios";
    const isIosNoSubscriptionState =
        Platform.OS === "ios" && !entitlementAllowed;
    const shouldLoadHostedStats =
        initialSessionResolved && hasHostedSession && hasActiveHostedConduit;

    const {
        summary,
        recent,
        isLoading: isMetricsLoading,
        updatedAt: hostedStatsUpdatedAt,
        isSyncing: isHostedStatsSyncing,
    } = useHostedHomeWidgetData(shouldLoadHostedStats);

    const personalConnected = recent?.personalActiveUsers ?? 0;
    const publicConnected = recent?.publicActiveUsers ?? 0;

    const entitlementRecord =
        (state.conduitsSnapshot?.entitlement as Record<
            string,
            unknown
        > | null) ?? null;
    const rawEvolutionLevel = entitlementRecord?.["evolution_level"];
    const remoteEvolutionLevel = resolveEvolutionLevel(rawEvolutionLevel);
    const hostedConduitsForScene = React.useMemo(
        () =>
            entitlementAllowed
                ? conduits
                      .filter(
                          (conduit) =>
                              conduit.status === "active" ||
                              conduit.status === "provisioning",
                      )
                      .sort((a, b) => {
                          // Public first (small orb, index 0),
                          // personal second (large orb, index 1).
                          const scopeRank = (
                              scope: "personal" | "public" | undefined,
                          ) => {
                              if (scope === "public") {
                                  return 0;
                              }
                              if (scope === "personal") {
                                  return 1;
                              }
                              return 2;
                          };

                          const rankDiff =
                              scopeRank(a.traffic_scope) -
                              scopeRank(b.traffic_scope);
                          if (rankDiff !== 0) {
                              return rankDiff;
                          }

                          return a.conduit_id.localeCompare(b.conduit_id);
                      })
                      .slice(0, 2)
                : [],
        [conduits, entitlementAllowed],
    );

    const showHostedSummary =
        entitlementAllowed && hostedConduitsForScene.length > 0;
    const localRunning = inproxyStatus === "RUNNING";
    const localStatusMetricsPending = localRunning && !localActivityStatsReady;
    const hostedStatusMetricsPending =
        showHostedSummary &&
        shouldLoadHostedStats &&
        isMetricsLoading &&
        !recent;
    const personalPairingStatusMetricsPending =
        localStatusMetricsPending || hostedStatusMetricsPending;
    const localSceneConnectedPeers = localRunning ? localConnectedPeers : 0;
    const personalPairingConnected = showLocalExperience
        ? localPersonalConnected + personalConnected
        : personalConnected;
    const localStationName =
        conduitName && conduitName.trim().length > 0
            ? conduitName.trim()
            : t("CONDUIT_STATION_I18N.string");
    const localProxyId = React.useMemo(() => {
        if (!conduitKeyPair.data?.publicKey) {
            return null;
        }

        return getProxyId(conduitKeyPair.data);
    }, [conduitKeyPair.data]);
    const hostedStationName =
        conduitName && conduitName.trim().length > 0
            ? conduitName.trim()
            : t("HOSTED_CONDUIT_FALLBACK_I18N.string");
    const orbStatusLead = showLocalExperience
        ? localStationName
        : isIosNoSubscriptionState
          ? ""
          : hostedStationName;

    const skyBoxGradientState: SkyBoxGradientState = entitlementAllowed
        ? localRunning
            ? 3
            : 2
        : localRunning
          ? 1
          : 0;

    const hostedTracks = React.useMemo<OrbHostedTrack[]>(
        () =>
            hostedConduitsForScene.map((conduit) => {
                const scope = conduit.traffic_scope ?? "personal";
                const connectedCount =
                    scope === "public" ? publicConnected : personalConnected;
                return {
                    id: conduit.conduit_id,
                    connectedCount,
                };
            }),
        [hostedConduitsForScene, personalConnected, publicConnected],
    );
    const useSimulatedSceneData =
        __DEV__ && runtimeConfig.devSimulatedDataEnabled;
    const [simulatedHostedTick, setSimulatedHostedTick] = React.useState(0);
    React.useEffect(() => {
        if (!useSimulatedSceneData) {
            return;
        }
        const interval = setInterval(() => {
            setSimulatedHostedTick((tick) => tick + 1);
        }, 1400);
        return () => {
            clearInterval(interval);
        };
    }, [useSimulatedSceneData]);
    const simulatedHostedTracks = React.useMemo<OrbHostedTrack[]>(() => {
        if (!useSimulatedSceneData) {
            return [];
        }

        const cycleA = [2, 3, 1, 4, 2];
        const cycleB = [1, 0, 2, 1, 3];
        const indexA = simulatedHostedTick % cycleA.length;
        const indexB = (simulatedHostedTick + 2) % cycleB.length;

        return [
            {
                id: "dev-sim-hosted-primary",
                connectedCount: cycleA[indexA],
            },
            {
                id: "dev-sim-hosted-secondary",
                connectedCount: cycleB[indexB],
            },
        ];
    }, [simulatedHostedTick, useSimulatedSceneData]);
    const orbSceneHostedTracks = isIosNoSubscriptionState
        ? []
        : useSimulatedSceneData
          ? simulatedHostedTracks
          : hostedTracks;

    const orbSlotMap = React.useMemo(() => {
        if (
            !preferredMainConduitId ||
            showLocalExperience ||
            orbSceneHostedTracks.length < 2
        ) {
            return undefined;
        }
        const idx = orbSceneHostedTracks.findIndex(
            (t) => t.id === preferredMainConduitId,
        );
        if (idx < 0 || idx === orbSceneHostedTracks.length - 1) {
            return undefined;
        }
        const map = orbSceneHostedTracks.map((_, i) => i);
        const lastIdx = orbSceneHostedTracks.length - 1;
        map[idx] = lastIdx;
        map[lastIdx] = idx;
        return map;
    }, [preferredMainConduitId, orbSceneHostedTracks, showLocalExperience]);
    const derivedConduitOrbCount =
        (showLocalExperience ? 1 : 0) + orbSceneHostedTracks.length;
    const derivedOrbEvolutionLevel = toOrbLevelFromCount(
        derivedConduitOrbCount,
    );
    const maxSceneEvolutionLevel: OrbEvolutionLevel = showLocalExperience
        ? 3
        : 2;
    const baseOrbEvolutionLevel: OrbEvolutionLevel = showLocalExperience
        ? toOrbLevelFromCount(derivedConduitOrbCount)
        : entitlementAllowed
          ? (remoteEvolutionLevel ?? derivedOrbEvolutionLevel)
          : 0;
    const orbEvolutionLevel = Math.min(
        baseOrbEvolutionLevel,
        maxSceneEvolutionLevel,
    ) as OrbEvolutionLevel;

    const orbActivityLanes = React.useMemo(() => {
        if (isIosNoSubscriptionState) {
            return [];
        }

        const lanes: OrbSceneActivityLane[] = [];

        if (showLocalExperience) {
            if (orbEvolutionLevel === 1) {
                lanes.push({
                    id: "local",
                    orbIndex: 0,
                    connectedCount: localSceneConnectedPeers,
                    exitXRatio: 0.5,
                    exitYRatio: 0.0,
                });
                return lanes;
            }

            if (orbEvolutionLevel === 2) {
                if (orbSceneHostedTracks[0]) {
                    lanes.push({
                        id: orbSceneHostedTracks[0].id,
                        orbIndex: 0,
                        connectedCount: orbSceneHostedTracks[0].connectedCount,
                        exitXRatio: 0.46,
                        exitYRatio: 0.22,
                    });
                }
                lanes.push({
                    id: "local",
                    orbIndex: 1,
                    connectedCount: localSceneConnectedPeers,
                    exitXRatio: 0.5,
                    exitYRatio: 0.075,
                });
                return lanes;
            }

            if (orbEvolutionLevel >= 3) {
                if (orbSceneHostedTracks[0]) {
                    lanes.push({
                        id: orbSceneHostedTracks[0].id,
                        orbIndex: 0,
                        connectedCount: orbSceneHostedTracks[0].connectedCount,
                        exitXRatio: 0.43,
                        exitYRatio: 0.22,
                    });
                }
                lanes.push({
                    id: "local",
                    orbIndex: 1,
                    connectedCount: localSceneConnectedPeers,
                    exitXRatio: 0.5,
                    exitYRatio: 0.075,
                });
                if (orbSceneHostedTracks[1]) {
                    lanes.push({
                        id: orbSceneHostedTracks[1].id,
                        orbIndex: 2,
                        connectedCount: orbSceneHostedTracks[1].connectedCount,
                        exitXRatio: 0.57,
                        exitYRatio: 0.18,
                    });
                }
            }

            return lanes;
        }

        orbSceneHostedTracks.forEach((track, index) => {
            lanes.push({
                id: track.id,
                orbIndex: index,
                connectedCount: track.connectedCount,
                exitXRatio:
                    orbEvolutionLevel <= 1
                        ? 0.5
                        : index === 0
                          ? 0.46
                          : index === 1
                            ? 0.54
                            : 0.58,
                exitYRatio:
                    orbEvolutionLevel <= 1
                        ? 0.22
                        : index === 0
                          ? 0.22
                          : index === 1
                            ? 0.2
                            : 0.18,
            });
        });

        return lanes;
    }, [
        isIosNoSubscriptionState,
        orbSceneHostedTracks,
        localSceneConnectedPeers,
        orbEvolutionLevel,
        showLocalExperience,
    ]);

    const hostedConduitByOrbIndex = React.useMemo(() => {
        const mapping = new Map<
            number,
            (typeof hostedConduitsForScene)[number]
        >();
        if (showLocalExperience) {
            if (orbEvolutionLevel >= 2 && hostedConduitsForScene[0]) {
                mapping.set(0, hostedConduitsForScene[0]);
            }
            if (orbEvolutionLevel >= 3 && hostedConduitsForScene[1]) {
                mapping.set(2, hostedConduitsForScene[1]);
            }
            return mapping;
        }

        hostedConduitsForScene.forEach((conduit, index) => {
            mapping.set(index, conduit);
        });
        return mapping;
    }, [hostedConduitsForScene, orbEvolutionLevel, showLocalExperience]);
    const selectedHostedOrbIndex = React.useMemo(() => {
        if (!selectedHostedConduitId) {
            return null;
        }
        const lane = orbActivityLanes.find(
            (entry) => entry.id === selectedHostedConduitId,
        );
        return lane?.orbIndex ?? null;
    }, [orbActivityLanes, selectedHostedConduitId]);

    const orbVisualModes = React.useMemo(() => {
        if (isIosNoSubscriptionState) {
            return ["off", "off", "off"] as OrbVisualMode[];
        }

        const modes: OrbVisualMode[] = ["off", "off", "off"];
        const hostedMode = (connectedCount: number): OrbVisualMode => {
            return connectedCount > 0 ? "in_use" : "announcing";
        };

        if (showLocalExperience) {
            const localMode: OrbVisualMode = localRunning
                ? localConnectedPeers > 0
                    ? "in_use"
                    : "announcing"
                : "off";

            if (orbEvolutionLevel === 1) {
                modes[0] = localMode;
                return modes;
            }

            if (orbEvolutionLevel === 2) {
                if (orbSceneHostedTracks[0]) {
                    modes[0] = hostedMode(
                        orbSceneHostedTracks[0].connectedCount,
                    );
                }
                modes[1] = localMode;
                return modes;
            }

            if (orbEvolutionLevel >= 3) {
                if (orbSceneHostedTracks[0]) {
                    modes[0] = hostedMode(
                        orbSceneHostedTracks[0].connectedCount,
                    );
                }
                modes[1] = localMode;
                if (orbSceneHostedTracks[1]) {
                    modes[2] = hostedMode(
                        orbSceneHostedTracks[1].connectedCount,
                    );
                }
            }
            return modes;
        }

        orbSceneHostedTracks.forEach((track, index) => {
            if (index > 2) {
                return;
            }
            modes[index] = hostedMode(track.connectedCount);
        });

        return modes;
    }, [
        isIosNoSubscriptionState,
        orbSceneHostedTracks,
        localConnectedPeers,
        localRunning,
        orbEvolutionLevel,
        showLocalExperience,
    ]);

    const localOrbIndex: number | null = showLocalExperience
        ? orbEvolutionLevel === 1
            ? 0
            : orbEvolutionLevel >= 2
              ? 1
              : null
        : null;

    const orbTapAction =
        showLocalExperience || orbEvolutionLevel === 0
            ? handleOrbPress
            : undefined;
    const orbLongPressAction =
        showLocalExperience && localRunning ? handleOrbLongPress : undefined;
    const statusOpacity =
        showLocalExperience && !localRunning && !entitlementAllowed ? 0 : 1;

    const showDefaultOrbHint: string | null =
        orbHint == null
            ? isIosNoSubscriptionState
                ? null
                : showLocalExperience && inproxyStatus !== "RUNNING"
                  ? t("TAP_TO_TURN_ON_I18N.string")
                  : !showLocalExperience && isMetricsLoading
                    ? t("SYNCING_HOSTED_USAGE_METRICS_I18N.string")
                    : null
            : orbHint;

    function openPairingModal(): void {
        openPersonalPairingModal();
    }

    function clearOrbHintTimeout() {
        if (orbHintTimeoutRef.current) {
            clearTimeout(orbHintTimeoutRef.current);
            orbHintTimeoutRef.current = null;
        }
    }

    function showOrbHint(message: string) {
        clearOrbHintTimeout();
        setOrbHint(message);
        orbHintTimeoutRef.current = setTimeout(() => {
            setOrbHint(null);
        }, 2600);
    }

    React.useEffect(() => {
        return () => {
            clearOrbHintTimeout();
        };
    }, []);

    function dismissHostedModal() {
        closeModal();
        setSelectedHostedConduitId(null);
    }

    React.useEffect(() => {
        if (!selectedHostedConduitId) {
            return;
        }
        const stillExists = conduits.some(
            (conduit) => conduit.conduit_id === selectedHostedConduitId,
        );
        if (!stillExists) {
            dismissHostedModal();
        }
    }, [conduits, selectedHostedConduitId]);

    function handleHostedPrimaryAction(): void {
        dismissHostedModal();
        if (hostedCallToActionMode === "loading") {
            return;
        }

        if (hostedCallToActionMode === "preparing") {
            showOrbHint(
                t("PREPARING_PERSONAL_PAIRING_I18N.string", {
                    defaultValue: "Preparing personal pairing...",
                }),
            );
            return;
        }

        if (hostedCallToActionMode === "share") {
            void openPairingModal();
            return;
        }

        router.push("/(app)/hosted-setup");
    }

    function handleOrbPress(): void {
        dismissHostedModal();
        if (!showLocalExperience) {
            handleHostedPrimaryAction();
            return;
        }

        if (inproxyMustUpgrade) {
            showOrbHint(t("UPGRADE_REQUIRED_LOCAL_CONDUIT_I18N.string"));
            return;
        }

        if (!isPersonalPairingReady) {
            showOrbHint(
                t("PREPARING_I18N.string", { defaultValue: "Preparing..." }),
            );
            return;
        }

        if (inproxyStatus === "RUNNING") {
            openModal(
                <LocalConduitModal
                    connectedCount={localConnectedPeers ?? 0}
                    bytesTransferred={localTotalBytesTransferred ?? 0}
                    proxyId={localProxyId}
                    onClose={dismissHostedModal}
                    onTurnOff={() => {
                        dismissHostedModal();
                        void toggleInproxy();
                    }}
                />,
            );
            return;
        }

        void toggleInproxy();
    }

    function handleOrbLongPress(): void {
        dismissHostedModal();
        if (!showLocalExperience) {
            handleHostedPrimaryAction();
            return;
        }

        if (inproxyMustUpgrade) {
            showOrbHint(t("UPGRADE_REQUIRED_LOCAL_CONDUIT_I18N.string"));
            return;
        }

        if (!isPersonalPairingReady) {
            showOrbHint(
                t("PREPARING_I18N.string", { defaultValue: "Preparing..." }),
            );
            return;
        }

        if (inproxyStatus === "RUNNING") {
            clearOrbHintTimeout();
            setOrbHint(null);
            void toggleInproxy();
            return;
        }
    }

    function handleHostedOrbPress(event: OrbSceneHostedOrbPressEvent): void {
        const conduit = hostedConduitByOrbIndex.get(event.orbIndex);
        if (!conduit) {
            return;
        }
        setSelectedHostedConduitId(conduit.conduit_id);
        const connectedCount = resolveHostedConduitConnectedCount(
            conduit.traffic_scope,
            personalConnected,
            publicConnected,
        );
        const bytesTransferred = resolveHostedConduitBytes(
            conduit.traffic_scope,
            summary?.personal.bytesTransferred ?? 0,
            summary?.public.bytesTransferred ?? 0,
        );
        // The big center slot is the last index in the non-local layout.
        // Only offer "set as main" when the tapped orb is a satellite.
        const isAlreadyMain =
            showLocalExperience ||
            orbSceneHostedTracks.length < 2 ||
            (orbSlotMap
                ? orbSlotMap[event.orbIndex] === orbSceneHostedTracks.length - 1
                : event.orbIndex === orbSceneHostedTracks.length - 1);

        openModal(
            <HostedConduitModal
                conduit={conduit}
                connectedCount={connectedCount}
                bytesTransferred={bytesTransferred}
                onClose={dismissHostedModal}
                onViewDashboard={() => {
                    dismissHostedModal();
                    router.push("/(app)/hosted-dashboard");
                }}
                onSetAsMain={
                    isAlreadyMain
                        ? undefined
                        : () => {
                              setPreferredMainConduitId(conduit.conduit_id);
                              dismissHostedModal();
                          }
                }
            />,
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SkyBox gradientState={skyBoxGradientState} />
            <SafeAreaView>
                <LogoWordmark width={totalUsableWidth} height={logoHeight} />

                {!showLocalExperience &&
                (!initialSessionResolved || isHostedEntitlementResolving) ? (
                    <View
                        style={{
                            width: totalUsableWidth,
                            height: orbSceneHeight,
                            justifyContent: "center",
                            alignItems: "center",
                        }}
                    >
                        <ActivityIndicator size="small" color="#8B5CF6" />
                    </View>
                ) : !heavyContentReady ? (
                    <View
                        style={{
                            width: totalUsableWidth,
                            height: orbSceneHeight,
                            justifyContent: "center",
                            alignItems: "center",
                        }}
                    >
                        <ActivityIndicator size="small" color="#6B7280" />
                    </View>
                ) : (
                    <>
                        <OrbScene
                            width={totalUsableWidth}
                            height={orbSceneHeight}
                            applyBlur={bgBlur}
                            maxVisibleOrbs={showLocalExperience ? 3 : 2}
                            evolutionLevel={orbEvolutionLevel}
                            themeLevel={skyBoxGradientState}
                            pressHint={showDefaultOrbHint}
                            activityLanes={orbActivityLanes}
                            orbModes={orbVisualModes}
                            localOrbIndex={localOrbIndex}
                            highlightedOrbIndex={selectedHostedOrbIndex}
                            onPress={orbTapAction}
                            onHostedOrbPress={handleHostedOrbPress}
                            onLongPress={orbLongPressAction}
                            statusOpacity={statusOpacity}
                            orbRadiusScale={1}
                            statusTopRatio={0.72}
                            pressDisabled={
                                !showLocalExperience &&
                                isHostedEntitlementResolving
                            }
                            accessibilityLabel={
                                showLocalExperience
                                    ? t(
                                          "LOCAL_CONDUIT_SCENE_ACCESSIBILITY_I18N.string",
                                      )
                                    : t(
                                          "HOSTED_CONDUIT_SCENE_ACCESSIBILITY_I18N.string",
                                      )
                            }
                            orbSlotMap={orbSlotMap}
                        />

                        <ConduitStatus
                            alias={orbStatusLead}
                            showLocal={showLocalExperience}
                            localMetricsPending={localStatusMetricsPending}
                            localPublicConnected={localPublicConnected}
                            localIsOnline={localRunning}
                            showHosted={showHostedSummary}
                            hostedMetricsPending={hostedStatusMetricsPending}
                            hostedPublicConnected={publicConnected}
                            personalPairingMetricsPending={
                                personalPairingStatusMetricsPending
                            }
                            personalPairingConnected={personalPairingConnected}
                        />
                    </>
                )}

                {(shouldLoadHostedStats || hostedStatsUpdatedAt) && (
                    <View
                        pointerEvents="none"
                        style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            bottom: 8,
                            paddingHorizontal: 16,
                            zIndex: 3,
                        }}
                    >
                        <StatsSyncStatusRow
                            updatedAt={hostedStatsUpdatedAt}
                            isSyncing={isHostedStatsSyncing}
                        />
                    </View>
                )}

                <ActionsArea
                    width={totalUsableWidth}
                    height={actionsAreaHeight}
                    hostedCallToActionMode={hostedCallToActionMode}
                    hasRecentHostedSignIn={lastAuthProvider != null}
                    showProvisioning={
                        (entitlementAllowed &&
                            (state.stationPhase === "none" ||
                                state.stationPhase === "provisioning")) ||
                        state.revenuecatPhase === "purchase_pending" ||
                        state.revenuecatPhase === "restore_pending"
                    }
                    showRenew={
                        state.entitlementSnapshot === "canceled_not_expired"
                    }
                    renewExpiresAt={formatExpiresAt(
                        state.conduitsSnapshot?.entitlement?.expires_at,
                    )}
                    onRenew={() =>
                        router.push({
                            pathname: "/(app)/hosted-setup",
                            params: { intent: "renew" },
                        })
                    }
                    onSharePersonalPairing={openPairingModal}
                    onHostedCallToActionPress={handleHostedPrimaryAction}
                />
            </SafeAreaView>
        </GestureHandlerRootView>
    );
}

function useHostedHomeWidgetData(enabled: boolean): {
    summary: DashboardSummaryAggregate | null;
    recent: DashboardRecentAggregate | null;
    isLoading: boolean;
    updatedAt: string | null;
    isSyncing: boolean;
} {
    const config = React.useMemo(readHostedRuntimeConfig, []);
    const sessionClient = React.useMemo(
        () => createHostedSessionClient({ baseUrl: config.baseUrl }),
        [config.baseUrl],
    );
    const hostedClient = React.useMemo(
        () => createHostedClient({ baseUrl: config.baseUrl }),
        [config.baseUrl],
    );
    const [appState, setAppState] = React.useState<AppStateStatus>(
        AppState.currentState,
    );

    React.useEffect(() => {
        const subscription = AppState.addEventListener("change", setAppState);
        return () => {
            subscription.remove();
        };
    }, []);

    const homeStatsQuery = useHostedHomeWidgetStats(
        {
            baseUrl: config.baseUrl,
            now: () => Date.now(),
            sessionClient,
            hostedClient,
        },
        enabled,
        appState === "active" ? 10_000 : false,
    );

    return {
        summary: homeStatsQuery.summary,
        recent: homeStatsQuery.recent,
        isLoading: homeStatsQuery.isLoading,
        updatedAt: homeStatsQuery.updatedAt,
        isSyncing: appState === "active" && homeStatsQuery.isSyncing,
    };
}

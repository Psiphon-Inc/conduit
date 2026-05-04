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
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, Text, View } from "react-native";
import {
    GestureHandlerRootView,
    ScrollView,
} from "react-native-gesture-handler";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import {
    SharedValue,
    runOnJS,
    useAnimatedReaction,
    useDerivedValue,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";

import { wrapError } from "@/src/common/errors";
import { MBToBytes, bytesToMB } from "@/src/common/utils";
import { AnimatedText } from "@/src/components/AnimatedText";
import { useConduitActions } from "@/src/components/ConduitActionsContext";
import { DropdownSection } from "@/src/components/DropdownSection";
import { EditableConduitAlias } from "@/src/components/EditableConduitAlias";
import { EditableNumberSlider } from "@/src/components/EditableNumberSlider";
import { GitHash } from "@/src/components/GitHash";
import { HostedConduitSettingsCard } from "@/src/components/HostedConduitSettingsCard";
import { Icon } from "@/src/components/Icon";
import { ReducedUsageWindow } from "@/src/components/ReducedUsageWindow";
import { RyveCallToAction } from "@/src/components/RyveCallToAction";
import {
    APPLE_STANDARD_EULA_URL,
    INPROXY_MAX_CLIENTS_MAX,
    INPROXY_MAX_CLIENTS_TOTAL_MAX,
    INPROXY_MAX_MBPS_PER_PEER_MAX,
    PRIVACY_POLICY_URL,
    TERMS_OF_USE_URL,
} from "@/src/constants";
import { useConduitName } from "@/src/hooks";
import { useInproxyContext } from "@/src/inproxy/context";
import { useInproxyStatus } from "@/src/inproxy/hooks";
import {
    DEFAULT_REDUCED_END_INDEX,
    DEFAULT_REDUCED_START_INDEX,
    convertLocalTimeToUtc,
    convertUtcTimeToLocal,
    formatTimeIndex,
    parseTimeIndex,
} from "@/src/inproxy/reducedUsageTime";
import {
    InproxyParameters,
    InproxyParametersSchema,
} from "@/src/inproxy/types";
import { palette, sharedStyles as ss } from "@/src/styles";

// ---------------------------------------------------------------------------
// LocalConduitSettingsCard — expandable card for phone-hosted conduit (Android)
// ---------------------------------------------------------------------------

const SETTINGS_HORIZONTAL_PADDING = 16;

function LocalConduitSettingsCard({
    expanded,
    setExpanded,
    isRunning,
    inproxyParameters,
    displayTotalMBps,
    reducedExpanded,
    setReducedExpanded,
    reducedTimeError,
    reducedStartIndex,
    reducedEndIndex,
    reducedEnabled,
    modifiedReducedStartTime,
    modifiedReducedEndTime,
    combinedPeersLimitExceeded,
    updateMaxClients,
    updateMaxPersonalClients,
    updateLimitBytesPerSecond,
    updateReducedMaxClients,
    updateReducedLimitBytesPerSecond,
    scrollRef,
    ensureReducedWindowDefaults,
    disableReducedWindow,
    showReducedSelector,
}: {
    expanded: boolean;
    setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    isRunning: boolean;
    inproxyParameters: InproxyParameters;
    displayTotalMBps: SharedValue<string>;
    reducedExpanded: boolean;
    setReducedExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    reducedTimeError: null | "format" | "range";
    reducedStartIndex: SharedValue<number>;
    reducedEndIndex: SharedValue<number>;
    reducedEnabled: SharedValue<boolean>;
    modifiedReducedStartTime: SharedValue<string>;
    modifiedReducedEndTime: SharedValue<string>;
    combinedPeersLimitExceeded: boolean;
    updateMaxClients: (v: number) => Promise<void>;
    updateMaxPersonalClients: (v: number) => Promise<void>;
    updateLimitBytesPerSecond: (v: number) => Promise<void>;
    updateReducedMaxClients: (v: number) => Promise<void>;
    updateReducedLimitBytesPerSecond: (v: number) => Promise<void>;
    scrollRef: React.RefObject<any>;
    ensureReducedWindowDefaults: () => void;
    disableReducedWindow: () => void;
    showReducedSelector: boolean;
}) {
    const { t } = useTranslation();

    const statusLabel = isRunning ? "ON" : "OFF";
    const statusColor = isRunning ? palette.peach : palette.black;
    const expandedLineItemStyle = [
        ss.paddedHorizontal,
        ss.row,
        ss.height60,
        ss.greyBorderBottom,
    ];

    return (
        <View
            style={[
                ss.greyBorderBottom,
                ss.padded,
                {
                    minHeight: 60,
                    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
                },
            ]}
        >
            <View style={[ss.column, { gap: 2 }]}>
                <Pressable
                    onPress={() => setExpanded((v) => !v)}
                    style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        minHeight: 40,
                    }}
                >
                    <Text style={[ss.bodyFont, ss.blackText]}>
                        Local Station
                    </Text>
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        <Text
                            style={[
                                ss.bodyFont,
                                {
                                    color: statusColor,
                                    textShadowColor: isRunning
                                        ? palette.peach
                                        : "transparent",
                                    textShadowOffset: { width: 0, height: 0 },
                                    textShadowRadius: isRunning ? 8 : 0,
                                },
                            ]}
                        >
                            {statusLabel}
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

                {expanded ? (
                    <DropdownSection>
                        <EditableNumberSlider
                            label={t("MAX_PUBLIC_PEERS_I18N.string")}
                            originalValue={inproxyParameters.maxClients}
                            min={1}
                            max={INPROXY_MAX_CLIENTS_MAX}
                            style={[...expandedLineItemStyle, ss.alignCenter]}
                            onChange={updateMaxClients}
                            scrollRef={scrollRef}
                        />
                        <EditableNumberSlider
                            label={t("MAX_PERSONAL_PEERS_I18N.string")}
                            originalValue={inproxyParameters.maxPersonalClients}
                            min={0}
                            max={INPROXY_MAX_CLIENTS_MAX}
                            style={[...expandedLineItemStyle, ss.alignCenter]}
                            onChange={updateMaxPersonalClients}
                            scrollRef={scrollRef}
                        />
                        <Text
                            style={[
                                ss.bodyFont,
                                ss.blackText,
                                {
                                    opacity: 0.7,
                                    marginTop: 4,
                                    marginBottom: 2,
                                    paddingHorizontal: 10,
                                    fontSize: 12,
                                },
                            ]}
                        >
                            {t("MAX_TOTAL_PEERS_NOTE_I18N.string", {
                                max: INPROXY_MAX_CLIENTS_TOTAL_MAX,
                            })}
                        </Text>
                        {combinedPeersLimitExceeded ? (
                            <Text
                                style={[
                                    ss.bodyFont,
                                    {
                                        color: palette.red,
                                        marginTop: 4,
                                        marginBottom: 6,
                                        paddingHorizontal: 10,
                                        fontSize: 12,
                                    },
                                ]}
                            >
                                {t("MAX_TOTAL_PEERS_ERROR_I18N.string", {
                                    max: INPROXY_MAX_CLIENTS_TOTAL_MAX,
                                })}
                            </Text>
                        ) : null}
                        <EditableNumberSlider
                            label={t("MAX_MBPS_PER_PEER_I18N.string")}
                            originalValue={bytesToMB(
                                inproxyParameters.limitUpstreamBytesPerSecond,
                            )}
                            min={2}
                            max={INPROXY_MAX_MBPS_PER_PEER_MAX}
                            style={[...expandedLineItemStyle, ss.alignCenter]}
                            onChange={updateLimitBytesPerSecond}
                            scrollRef={scrollRef}
                        />
                        <View
                            style={[
                                ...expandedLineItemStyle,
                                ss.flex,
                                ss.alignCenter,
                                ss.justifySpaceBetween,
                            ]}
                        >
                            <Text style={[ss.bodyFont, ss.blackText]}>
                                {t("REQUIRED_BANDWIDTH_I18N.string")}
                            </Text>
                            <AnimatedText
                                text={displayTotalMBps}
                                color={palette.black}
                                fontFamily={ss.bodyFont.fontFamily}
                                fontSize={ss.bodyFont.fontSize}
                            />
                        </View>
                        <ReducedUsageWindow
                            reducedExpanded={reducedExpanded}
                            setReducedExpanded={setReducedExpanded}
                            reducedTimeError={reducedTimeError}
                            reducedStartIndex={reducedStartIndex}
                            reducedEndIndex={reducedEndIndex}
                            reducedEnabled={reducedEnabled}
                            modifiedReducedStartTime={modifiedReducedStartTime}
                            modifiedReducedEndTime={modifiedReducedEndTime}
                            inproxyParameters={inproxyParameters}
                            updateReducedMaxClients={updateReducedMaxClients}
                            updateReducedLimitBytesPerSecond={
                                updateReducedLimitBytesPerSecond
                            }
                            scrollRef={scrollRef}
                            ensureReducedWindowDefaults={
                                ensureReducedWindowDefaults
                            }
                            disableReducedWindow={disableReducedWindow}
                            showSelector={showReducedSelector}
                        />
                    </DropdownSection>
                ) : null}
            </View>
        </View>
    );
}

// ---------------------------------------------------------------------------
// ConduitSettings — main settings screen
// ---------------------------------------------------------------------------

export function ConduitSettings({ inline = false }: { inline?: boolean }) {
    const { t } = useTranslation();
    const router = useRouter();

    const {
        inproxyParameters,
        isPersonalPairingReady,
        selectInproxyParameters,
        logErrorToDiagnostic,
    } = useInproxyContext();
    const { data: inproxyStatus } = useInproxyStatus();
    const { data: conduitName } = useConduitName();
    const showLocalConduitSettings = Platform.OS !== "ios";
    const {
        openPersonalPairingModal,
        openRyveClaimModal,
        personalCompartmentId,
        isPersonalPairingPreparing,
        hostedRyveClaim,
    } = useConduitActions();
    const disablePersonalPairingOnIos =
        Platform.OS === "ios" && personalCompartmentId == null;
    const hostedRewardsLabel =
        Platform.OS === "android"
            ? t("HOSTED_REWARDS_I18N.string")
            : t("REWARDS_I18N.string");
    const localRewardsLabel = t("LOCAL_REWARDS_I18N.string");
    const termsOfUseUrl =
        Platform.OS === "ios" ? APPLE_STANDARD_EULA_URL : TERMS_OF_USE_URL;

    const [displayRestartConfirmation, setDisplayRestartConfirmation] =
        React.useState(false);
    const [hasStagedChanges, setHasStagedChanges] = React.useState(false);
    const [localSettingsExpanded, setLocalSettingsExpanded] =
        React.useState(false);
    const [showReducedSelector, setShowReducedSelector] = React.useState(false);
    const localStationIsRunning = inproxyStatus === "RUNNING";
    const settingsPaddedStyle = [
        ss.padded,
        { paddingHorizontal: SETTINGS_HORIZONTAL_PADDING },
    ];
    const settingsLineItemStyle = [
        ss.padded,
        ss.row,
        ss.height60,
        { paddingHorizontal: SETTINGS_HORIZONTAL_PADDING },
    ];

    const storedReducedStart = inproxyParameters.reducedStartTime
        ? convertUtcTimeToLocal(inproxyParameters.reducedStartTime)
        : "";
    const storedReducedEnd = inproxyParameters.reducedEndTime
        ? convertUtcTimeToLocal(inproxyParameters.reducedEndTime)
        : "";
    const storedReducedEnabled =
        storedReducedStart.length > 0 && storedReducedEnd.length > 0;

    const [reducedExpanded, setReducedExpanded] = React.useState(false);
    const [combinedPeersLimitExceeded, setCombinedPeersLimitExceeded] =
        React.useState(false);
    const reducedStartIndex = useSharedValue(
        parseTimeIndex(storedReducedStart) ?? DEFAULT_REDUCED_START_INDEX,
    );
    const reducedEndIndex = useSharedValue(
        parseTimeIndex(storedReducedEnd) ?? DEFAULT_REDUCED_END_INDEX,
    );
    const [reducedTimeError, setReducedTimeError] = React.useState<
        null | "format" | "range"
    >(null);
    const reducedTimePattern = React.useMemo(
        () => /^([01]\d|2[0-3]):([0-5]\d)$/,
        [],
    );

    function getReducedTimeErrorKey(startTime: string, endTime: string) {
        const startNormalized = startTime.trim();
        const endNormalized = endTime.trim();
        const reducedActive =
            startNormalized.length > 0 || endNormalized.length > 0;
        if (!reducedActive) {
            return null;
        }
        if (
            !reducedTimePattern.test(startNormalized) ||
            !reducedTimePattern.test(endNormalized)
        ) {
            return "format";
        }
        const startIndex = parseTimeIndex(startNormalized);
        const endIndex = parseTimeIndex(endNormalized);
        if (startIndex === null || endIndex === null) {
            return "format";
        }
        if (startIndex === endIndex) {
            return "range";
        }
        return null;
    }

    const modifiedMaxPeers = useSharedValue(inproxyParameters.maxClients);
    const modifiedMaxPersonalPeers = useSharedValue(
        inproxyParameters.maxPersonalClients,
    );
    const modifiedMaxMBps = useSharedValue(
        bytesToMB(inproxyParameters.limitUpstreamBytesPerSecond),
    );
    const modifiedReducedMaxPeers = useSharedValue(
        inproxyParameters.reducedMaxClients ?? inproxyParameters.maxClients,
    );
    const modifiedReducedMaxMBps = useSharedValue(
        bytesToMB(
            inproxyParameters.reducedLimitUpstreamBytesPerSecond ??
                inproxyParameters.limitUpstreamBytesPerSecond,
        ),
    );
    const modifiedReducedStartTime = useSharedValue(storedReducedStart);
    const modifiedReducedEndTime = useSharedValue(storedReducedEnd);
    const reducedEnabled = useSharedValue(storedReducedEnabled);
    const savedMaxPeers = useSharedValue(inproxyParameters.maxClients);
    const savedMaxPersonalPeers = useSharedValue(
        inproxyParameters.maxPersonalClients,
    );
    const savedLimitBytesPerSecond = useSharedValue(
        inproxyParameters.limitUpstreamBytesPerSecond,
    );
    const savedReducedStartTime = useSharedValue(storedReducedStart);
    const savedReducedEndTime = useSharedValue(storedReducedEnd);
    const savedReducedMaxPeers = useSharedValue(
        inproxyParameters.reducedMaxClients ?? inproxyParameters.maxClients,
    );
    const savedReducedLimitBytesPerSecond = useSharedValue(
        inproxyParameters.reducedLimitUpstreamBytesPerSecond ??
            inproxyParameters.limitUpstreamBytesPerSecond,
    );
    const displayTotalMBps = useDerivedValue(() => {
        return `${(modifiedMaxPeers.value + modifiedMaxPersonalPeers.value) * modifiedMaxMBps.value} MB/s`;
    });
    const applyChangesNoteOpacity = useSharedValue(0);
    const changesPending = useDerivedValue(() => {
        let settingsChanged = false;
        const reducedStartNormalized = modifiedReducedStartTime.value.trim();
        const reducedEndNormalized = modifiedReducedEndTime.value.trim();
        const currentReducedStart = savedReducedStartTime.value;
        const currentReducedEnd = savedReducedEndTime.value;
        const reducedActive =
            reducedStartNormalized.length > 0 ||
            reducedEndNormalized.length > 0 ||
            currentReducedStart.length > 0 ||
            currentReducedEnd.length > 0;

        if (modifiedMaxPeers.value !== savedMaxPeers.value) {
            settingsChanged = true;
        } else if (
            modifiedMaxPersonalPeers.value !== savedMaxPersonalPeers.value
        ) {
            settingsChanged = true;
        } else if (
            MBToBytes(modifiedMaxMBps.value) !== savedLimitBytesPerSecond.value
        ) {
            settingsChanged = true;
        } else if (
            reducedStartNormalized !== currentReducedStart ||
            reducedEndNormalized !== currentReducedEnd
        ) {
            settingsChanged = true;
        } else if (reducedActive) {
            if (modifiedReducedMaxPeers.value !== savedReducedMaxPeers.value) {
                settingsChanged = true;
            } else if (
                MBToBytes(modifiedReducedMaxMBps.value) !==
                savedReducedLimitBytesPerSecond.value
            ) {
                settingsChanged = true;
            }
        }
        return settingsChanged;
    });

    useAnimatedReaction(
        () => changesPending.value,
        (current: boolean, previous: boolean | null) => {
            if (current !== previous) {
                runOnJS(setHasStagedChanges)(current);
            }
            if (current) {
                applyChangesNoteOpacity.value = withTiming(1, {
                    duration: 500,
                });
            } else {
                applyChangesNoteOpacity.value = 0;
            }
        },
    );

    const applyChangesNoteStyle = useAnimatedStyle(() => {
        return {
            opacity: applyChangesNoteOpacity.value,
        };
    });

    function resetSettingsFromInproxyProvider() {
        modifiedMaxPeers.value = inproxyParameters.maxClients;
        modifiedMaxPersonalPeers.value = inproxyParameters.maxPersonalClients;
        setCombinedPeersLimitExceeded(
            inproxyParameters.maxClients +
                inproxyParameters.maxPersonalClients >
                INPROXY_MAX_CLIENTS_TOTAL_MAX,
        );
        modifiedMaxMBps.value = bytesToMB(
            inproxyParameters.limitUpstreamBytesPerSecond,
        );
        modifiedReducedMaxPeers.value =
            inproxyParameters.reducedMaxClients ?? inproxyParameters.maxClients;
        modifiedReducedMaxMBps.value = bytesToMB(
            inproxyParameters.reducedLimitUpstreamBytesPerSecond ??
                inproxyParameters.limitUpstreamBytesPerSecond,
        );
        const startTime = inproxyParameters.reducedStartTime
            ? convertUtcTimeToLocal(inproxyParameters.reducedStartTime)
            : "";
        const endTime = inproxyParameters.reducedEndTime
            ? convertUtcTimeToLocal(inproxyParameters.reducedEndTime)
            : "";
        const startIndex =
            parseTimeIndex(startTime) ?? DEFAULT_REDUCED_START_INDEX;
        const endIndex = parseTimeIndex(endTime) ?? DEFAULT_REDUCED_END_INDEX;
        modifiedReducedStartTime.value = startTime;
        modifiedReducedEndTime.value = endTime;
        savedMaxPeers.value = inproxyParameters.maxClients;
        savedMaxPersonalPeers.value = inproxyParameters.maxPersonalClients;
        savedLimitBytesPerSecond.value =
            inproxyParameters.limitUpstreamBytesPerSecond;
        savedReducedStartTime.value = startTime;
        savedReducedEndTime.value = endTime;
        savedReducedMaxPeers.value =
            inproxyParameters.reducedMaxClients ?? inproxyParameters.maxClients;
        savedReducedLimitBytesPerSecond.value =
            inproxyParameters.reducedLimitUpstreamBytesPerSecond ??
            inproxyParameters.limitUpstreamBytesPerSecond;
        reducedStartIndex.value = startIndex;
        reducedEndIndex.value = endIndex;
        reducedEnabled.value = startTime.length > 0 && endTime.length > 0;
        setReducedExpanded(false);
        setReducedTimeError(null);
    }
    React.useEffect(() => {
        resetSettingsFromInproxyProvider();
    }, [inproxyParameters]);

    const settingsVisible = inline;

    React.useEffect(() => {
        if (!settingsVisible) {
            setShowReducedSelector(false);
            return;
        }
        setShowReducedSelector(false);
        const timer = setTimeout(() => {
            setShowReducedSelector(true);
        }, 300);
        return () => clearTimeout(timer);
    }, [settingsVisible]);

    async function updateInproxyMaxClients(newValue: number) {
        modifiedMaxPeers.value = newValue;
        setCombinedPeersLimitExceeded(
            newValue + modifiedMaxPersonalPeers.value >
                INPROXY_MAX_CLIENTS_TOTAL_MAX,
        );
    }

    async function updateInproxyMaxPersonalClients(newValue: number) {
        modifiedMaxPersonalPeers.value = newValue;
        setCombinedPeersLimitExceeded(
            modifiedMaxPeers.value + newValue > INPROXY_MAX_CLIENTS_TOTAL_MAX,
        );
    }

    async function updateInproxyLimitBytesPerSecond(newValue: number) {
        modifiedMaxMBps.value = newValue;
    }

    async function updateReducedMaxClients(newValue: number) {
        modifiedReducedMaxPeers.value = newValue;
    }

    async function updateReducedLimitBytesPerSecond(newValue: number) {
        modifiedReducedMaxMBps.value = newValue;
    }

    function ensureReducedWindowDefaults() {
        let startLabel = modifiedReducedStartTime.value.trim();
        let endLabel = modifiedReducedEndTime.value.trim();
        let startValue = reducedStartIndex.value;
        let endValue = reducedEndIndex.value;

        if (startLabel.length === 0) {
            startValue = DEFAULT_REDUCED_START_INDEX;
            startLabel = formatTimeIndex(startValue);
        } else {
            const parsedStart = parseTimeIndex(startLabel);
            if (parsedStart !== null) {
                startValue = parsedStart;
            }
        }

        if (endLabel.length === 0) {
            endValue = DEFAULT_REDUCED_END_INDEX;
            endLabel = formatTimeIndex(endValue);
        } else {
            const parsedEnd = parseTimeIndex(endLabel);
            if (parsedEnd !== null) {
                endValue = parsedEnd;
            }
        }

        reducedStartIndex.value = startValue;
        reducedEndIndex.value = endValue;
        modifiedReducedStartTime.value = startLabel;
        modifiedReducedEndTime.value = endLabel;
        reducedEnabled.value = startLabel.length > 0 && endLabel.length > 0;
    }

    function disableReducedWindow() {
        setReducedExpanded(false);
        reducedStartIndex.value = DEFAULT_REDUCED_START_INDEX;
        reducedEndIndex.value = DEFAULT_REDUCED_END_INDEX;
        modifiedReducedStartTime.value = "";
        modifiedReducedEndTime.value = "";
        reducedEnabled.value = false;
        setReducedTimeError(null);
    }

    async function commitChanges() {
        const reducedStartNormalized = modifiedReducedStartTime.value.trim();
        const reducedEndNormalized = modifiedReducedEndTime.value.trim();
        const reducedTimeErrorKey = getReducedTimeErrorKey(
            reducedStartNormalized,
            reducedEndNormalized,
        );
        if (reducedTimeErrorKey) {
            setReducedTimeError(reducedTimeErrorKey);
            return;
        }
        if (reducedTimeError) {
            setReducedTimeError(null);
        }
        if (combinedPeersLimitExceeded) {
            return;
        }
        const reducedEnabledFlag =
            reducedStartNormalized.length > 0 &&
            reducedEndNormalized.length > 0;
        const maxClients = modifiedMaxPeers.value;
        const maxPersonalClients = modifiedMaxPersonalPeers.value;
        const reducedStartUtc = reducedEnabledFlag
            ? convertLocalTimeToUtc(reducedStartNormalized)
            : undefined;
        const reducedEndUtc = reducedEnabledFlag
            ? convertLocalTimeToUtc(reducedEndNormalized)
            : undefined;
        const reducedMaxClients = Math.min(
            modifiedReducedMaxPeers.value,
            maxClients,
        );
        const reducedLimitBytes = MBToBytes(modifiedReducedMaxMBps.value);
        const newInproxyParameters = InproxyParametersSchema.safeParse({
            maxClients,
            maxPersonalClients,
            personalCompartmentId: inproxyParameters.personalCompartmentId,
            limitUpstreamBytesPerSecond: MBToBytes(modifiedMaxMBps.value),
            limitDownstreamBytesPerSecond: MBToBytes(modifiedMaxMBps.value),
            privateKey: inproxyParameters.privateKey,
            reducedStartTime: reducedStartUtc,
            reducedEndTime: reducedEndUtc,
            reducedMaxClients: reducedEnabledFlag
                ? reducedMaxClients
                : undefined,
            reducedLimitUpstreamBytesPerSecond: reducedEnabledFlag
                ? reducedLimitBytes
                : undefined,
            reducedLimitDownstreamBytesPerSecond: reducedEnabledFlag
                ? reducedLimitBytes
                : undefined,
        } as InproxyParameters);
        if (newInproxyParameters.error) {
            logErrorToDiagnostic(
                wrapError(
                    newInproxyParameters.error,
                    "Error parsing updated InproxyParameters",
                ),
            );
            return;
        }
        selectInproxyParameters(newInproxyParameters.data);
    }

    async function onSavePress() {
        if (!changesPending.value) {
            return;
        }
        const reducedStartNormalized = modifiedReducedStartTime.value.trim();
        const reducedEndNormalized = modifiedReducedEndTime.value.trim();
        const reducedTimeErrorKey = getReducedTimeErrorKey(
            reducedStartNormalized,
            reducedEndNormalized,
        );

        if (reducedTimeErrorKey) {
            setReducedTimeError(reducedTimeErrorKey);
            return;
        }

        if (combinedPeersLimitExceeded) {
            return;
        }

        if (changesPending.value) {
            if (showLocalConduitSettings && inproxyStatus === "RUNNING") {
                setDisplayRestartConfirmation(true);
                return;
            }
            await commitChanges();
        }
    }

    function renderSettingsAction({
        icon,
        label,
        subtitle,
        onPress,
        disabled = false,
    }: {
        icon: React.ReactNode;
        label: string;
        subtitle?: string;
        onPress: () => void;
        disabled?: boolean;
    }) {
        return (
            <Pressable
                onPress={onPress}
                disabled={disabled}
                style={[
                    ...settingsLineItemStyle,
                    ss.justifySpaceBetween,
                    {
                        flexDirection: "row",
                        alignItems: "center",
                        opacity: disabled ? 0.65 : 1,
                    },
                ]}
            >
                <View style={[ss.row, ss.alignCenter, ss.flex, { gap: 10 }]}>
                    {icon}
                    <View style={[ss.column, ss.flex, { gap: 4 }]}>
                        <Text style={[ss.bodyFont, ss.blackText]}>{label}</Text>
                        {subtitle ? (
                            <Text
                                style={[
                                    ss.tinyFont,
                                    ss.blackText,
                                    { opacity: 0.7 },
                                ]}
                            >
                                {subtitle}
                            </Text>
                        ) : null}
                    </View>
                </View>
                <Icon
                    name="chevron-right"
                    color={disabled ? palette.lightGrey : palette.black}
                    size={16}
                />
            </Pressable>
        );
    }

    const scrollRef = React.useRef<any>(null);
    const canSaveChanges =
        hasStagedChanges &&
        !combinedPeersLimitExceeded &&
        isPersonalPairingReady;

    if (displayRestartConfirmation) {
        return (
            <RestartConfirmation
                onConfirm={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    await commitChanges();
                    setDisplayRestartConfirmation(false);
                }}
                onCancel={() => {
                    setDisplayRestartConfirmation(false);
                }}
            />
        );
    }

    return (
        <View style={[ss.flex]}>
            {/* Header */}
            <View
                style={[
                    ...settingsPaddedStyle,
                    ss.greyBorderBottom,
                    ss.row,
                    ss.alignCenter,
                    ss.justifySpaceBetween,
                ]}
            >
                <Text
                    style={[
                        ss.blackText,
                        ss.extraLargeFont,
                        { fontFamily: "JuraBold" },
                    ]}
                >
                    {t("SETTINGS_I18N.string")}
                </Text>

                <View style={[ss.row, ss.alignCenter, { gap: 12 }]}>
                    {showLocalConduitSettings ? (
                        <Animated.View
                            style={[
                                ss.row,
                                ss.alignCenter,
                                applyChangesNoteStyle,
                            ]}
                        >
                            <Pressable
                                onPress={() => void onSavePress()}
                                disabled={!canSaveChanges}
                                style={({ pressed }) => [
                                    ss.rounded10,
                                    {
                                        backgroundColor: hasStagedChanges
                                            ? palette.black
                                            : "transparent",
                                        opacity:
                                            canSaveChanges && pressed
                                                ? 0.85
                                                : hasStagedChanges &&
                                                    combinedPeersLimitExceeded
                                                  ? 0.4
                                                  : 1,
                                        paddingHorizontal: hasStagedChanges
                                            ? 12
                                            : 0,
                                        paddingVertical: hasStagedChanges
                                            ? 7
                                            : 0,
                                    },
                                ]}
                            >
                                {hasStagedChanges ? (
                                    <Text
                                        style={[
                                            ss.bodyFont,
                                            {
                                                color: palette.white,
                                            },
                                        ]}
                                    >
                                        {t("SAVE_I18N.string")}
                                    </Text>
                                ) : null}
                            </Pressable>
                        </Animated.View>
                    ) : null}

                    {/* Close button removed — use bottom navigation */}
                </View>
            </View>

            {/* Scrollable body */}
            <GestureHandlerRootView>
                <ScrollView
                    contentContainerStyle={{ width: "100%", flexGrow: 1 }}
                    ref={scrollRef}
                >
                    {/* Editable name */}
                    <View
                        style={[
                            ...settingsPaddedStyle,
                            { minHeight: 60, justifyContent: "center" },
                        ]}
                    >
                        <EditableConduitAlias
                            fallbackName={t("CONDUIT_STATION_I18N.string")}
                            fontSize={18}
                            labelBackground="#FFFFFF"
                        />
                    </View>

                    {/* Local conduit settings (Android only) */}
                    {showLocalConduitSettings ? (
                        <LocalConduitSettingsCard
                            expanded={localSettingsExpanded}
                            setExpanded={setLocalSettingsExpanded}
                            isRunning={localStationIsRunning}
                            inproxyParameters={inproxyParameters}
                            displayTotalMBps={displayTotalMBps}
                            reducedExpanded={reducedExpanded}
                            setReducedExpanded={setReducedExpanded}
                            reducedTimeError={reducedTimeError}
                            reducedStartIndex={reducedStartIndex}
                            reducedEndIndex={reducedEndIndex}
                            reducedEnabled={reducedEnabled}
                            modifiedReducedStartTime={modifiedReducedStartTime}
                            modifiedReducedEndTime={modifiedReducedEndTime}
                            combinedPeersLimitExceeded={
                                combinedPeersLimitExceeded
                            }
                            updateMaxClients={updateInproxyMaxClients}
                            updateMaxPersonalClients={
                                updateInproxyMaxPersonalClients
                            }
                            updateLimitBytesPerSecond={
                                updateInproxyLimitBytesPerSecond
                            }
                            updateReducedMaxClients={updateReducedMaxClients}
                            updateReducedLimitBytesPerSecond={
                                updateReducedLimitBytesPerSecond
                            }
                            scrollRef={scrollRef}
                            ensureReducedWindowDefaults={
                                ensureReducedWindowDefaults
                            }
                            disableReducedWindow={disableReducedWindow}
                            showReducedSelector={showReducedSelector}
                        />
                    ) : null}

                    {/* Personal Pairing */}
                    {renderSettingsAction({
                        icon: (
                            <ExpoImage
                                source={require("@/assets/images/icons/p2p_24px.svg")}
                                tintColor={palette.black}
                                style={{ width: 20, height: 20 }}
                                contentFit="contain"
                            />
                        ),
                        label: t("SETTINGS_PERSONAL_PAIRING_I18N.string"),
                        subtitle: isPersonalPairingPreparing
                            ? t("PREPARING_PERSONAL_PAIRING_I18N.string", {
                                  defaultValue: "Preparing personal pairing...",
                              })
                            : t(
                                  "SETTINGS_PERSONAL_PAIRING_DESCRIPTION_I18N.string",
                              ),
                        onPress: () => openPersonalPairingModal(),
                        disabled: disablePersonalPairingOnIos,
                    })}

                    {/* Claim hosted rewards */}
                    {hostedRyveClaim
                        ? renderSettingsAction({
                              icon: (
                                  <ExpoImage
                                      source={require("@/assets/images/icons/ryve.svg")}
                                      tintColor={palette.black}
                                      style={{ width: 20, height: 20 }}
                                      contentFit="contain"
                                  />
                              ),
                              label: hostedRewardsLabel,
                              subtitle: t("CLAIM_REWARDS_IN_RYVE_I18N.string"),
                              onPress: () =>
                                  openRyveClaimModal(
                                      hostedRyveClaim,
                                      conduitName,
                                  ),
                          })
                        : null}

                    {/* Claim local rewards (Android only) */}
                    {Platform.OS === "android" ? (
                        <RyveCallToAction
                            triggerLabel={localRewardsLabel}
                            renderTrigger={(onPress) =>
                                renderSettingsAction({
                                    icon: (
                                        <ExpoImage
                                            source={require("@/assets/images/icons/ryve.svg")}
                                            tintColor={palette.black}
                                            style={{ width: 20, height: 20 }}
                                            contentFit="contain"
                                        />
                                    ),
                                    label: localRewardsLabel,
                                    subtitle: t(
                                        "CLAIM_REWARDS_IN_RYVE_I18N.string",
                                    ),
                                    onPress,
                                })
                            }
                        />
                    ) : null}

                    {/* Account */}
                    <View style={[...settingsPaddedStyle, { minHeight: 60 }]}>
                        <HostedConduitSettingsCard />
                    </View>

                    {renderSettingsAction({
                        icon: (
                            <Icon
                                name="question"
                                color={palette.black}
                                size={20}
                            />
                        ),
                        label: t("MORE_INFO_I18N.string"),
                        onPress: () => router.push("/(app)/onboarding"),
                    })}

                    {/* Legal */}
                    <View
                        style={[
                            ...settingsPaddedStyle,
                            ss.row,
                            ss.alignCenter,
                            {
                                gap: 6,
                                marginTop: 20,
                                paddingVertical: 0,
                            },
                        ]}
                    >
                        <View
                            style={{
                                width: 12,
                                height: 1,
                                backgroundColor: "rgba(0, 0, 0, 0.32)",
                            }}
                        />
                        <Text style={[ss.tinyFont, ss.lightGreyText]}>
                            {t("LEGAL_I18N.string")}
                        </Text>
                        <View
                            style={{
                                flex: 1,
                                height: 1,
                                backgroundColor: "rgba(0, 0, 0, 0.32)",
                            }}
                        />
                    </View>

                    {renderSettingsAction({
                        icon: (
                            <Icon
                                name="shield"
                                color={palette.black}
                                size={20}
                            />
                        ),
                        label: t("PRIVACY_POLICY_I18N.string"),
                        onPress: () => void Linking.openURL(PRIVACY_POLICY_URL),
                    })}

                    {renderSettingsAction({
                        icon: (
                            <Icon
                                name="notepad"
                                color={palette.black}
                                size={20}
                            />
                        ),
                        label: t("TERMS_OF_USE_I18N.string"),
                        onPress: () => void Linking.openURL(termsOfUseUrl),
                    })}

                    <View style={{ flexGrow: 1, minHeight: 30 }} />

                    {/* App version */}
                    <View
                        style={[
                            ...settingsPaddedStyle,
                            {
                                alignItems: "flex-end",
                                paddingTop: 20,
                                paddingBottom: 16,
                            },
                        ]}
                    >
                        <GitHash />
                    </View>
                </ScrollView>
            </GestureHandlerRootView>
        </View>
    );
}

// ---------------------------------------------------------------------------
// RestartConfirmation — shown when local conduit is running and settings changed
// ---------------------------------------------------------------------------

function RestartConfirmation({
    onConfirm,
    onCancel,
}: {
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const { t } = useTranslation();

    return (
        <View style={[ss.flex]}>
            <View
                style={[
                    ss.flex,
                    ss.column,
                    ss.alignCenter,
                    ss.justifyCenter,
                    ss.doubleGap,
                    ss.doublePadded,
                ]}
            >
                <Text style={[ss.blackText, ss.bodyFont]}>
                    {t(
                        "SETTINGS_CHANGE_WILL_RESTART_CONDUIT_DESCRIPTION_I18N.string",
                    )}
                </Text>
                <Text style={[ss.blackText, ss.bodyFont]}>
                    {t("CONFIRM_CHANGES_I18N.string")}
                </Text>
                <View style={[ss.row]}>
                    <Pressable
                        style={[
                            ss.padded,
                            ss.rounded10,
                            { backgroundColor: palette.white },
                        ]}
                        onPress={onConfirm}
                    >
                        <Text style={[ss.blackText, ss.bodyFont]}>
                            {t("CONFIRM_I18N.string")}
                        </Text>
                    </Pressable>
                    <Pressable
                        style={[
                            ss.padded,
                            ss.rounded10,
                            { backgroundColor: palette.grey },
                        ]}
                        onPress={onCancel}
                    >
                        <Text style={[ss.bodyFont, { color: palette.white }]}>
                            {t("CANCEL_I18N.string")}
                        </Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

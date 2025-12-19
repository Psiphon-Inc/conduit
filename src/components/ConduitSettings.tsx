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
import { BlendMode, Skia } from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import {
    GestureHandlerRootView,
    ScrollView,
} from "react-native-gesture-handler";
import Animated, {
    useAnimatedReaction,
    useDerivedValue,
    useSharedValue,
    withDelay,
    withTiming,
} from "react-native-reanimated";

import { useConduitKeyPair } from "@/src/auth/hooks";
import { wrapError } from "@/src/common/errors";
import { MBToBytes, bytesToMB } from "@/src/common/utils";
import { AnimatedText } from "@/src/components/AnimatedText";
import { ConduitName } from "@/src/components/ConduitName";
import { EditableNumberSlider } from "@/src/components/EditableNumberSlider";
import { Icon } from "@/src/components/Icon";
import { NotificationsStatus } from "@/src/components/NotificationsStatus";
import { PrivacyPolicyLink } from "@/src/components/PrivacyPolicyLink";
import { ProxyID } from "@/src/components/ProxyID";
import { SendDiagnosticButton } from "@/src/components/SendDiagnosticButton";
import { InproxyStatusColorCanvas } from "@/src/components/SkyBox";
import {
    INPROXY_MAX_CLIENTS_MAX,
    INPROXY_MAX_MBPS_PER_PEER_MAX,
} from "@/src/constants";
import { useNotificationsPermissions } from "@/src/hooks";
import { useInproxyContext } from "@/src/inproxy/context";
import { useInproxyStatus } from "@/src/inproxy/hooks";
import {
    InproxyParameters,
    InproxyParametersSchema,
} from "@/src/inproxy/types";
import { getProxyId } from "@/src/inproxy/utils";
import {
    lineItemStyle,
    palette,
    sharedStyles as ss,
} from "@/src/styles";

export function ConduitSettings({
    setBgBlur,
}: {
    setBgBlur: React.Dispatch<React.SetStateAction<boolean>>;
}) {
    const { t } = useTranslation();
    const win = useWindowDimensions();
    const router = useRouter();

    const { data: conduitKeyPair } = useConduitKeyPair();
    const { inproxyParameters, selectInproxyParameters, logErrorToDiagnostic } =
        useInproxyContext();
    const { data: inproxyStatus } = useInproxyStatus();
    const { data: notificationsPermission } = useNotificationsPermissions();

    const [modalOpen, setModalOpen] = React.useState(false);
    const [displayRestartConfirmation, setDisplayRestartConfirmation] =
        React.useState(false);

    const modifiedMaxPeers = useSharedValue(inproxyParameters.maxClients);
    const modifiedMaxMBps = useSharedValue(
        bytesToMB(inproxyParameters.limitUpstreamBytesPerSecond),
    );
    const displayTotalMBps = useDerivedValue(() => {
        return `${modifiedMaxPeers.value * modifiedMaxMBps.value} MB/s`;
    });
    const applyChangesNoteOpacity = useSharedValue(0);
    const changesPending = useDerivedValue(() => {
        let settingsChanged = false;
        if (modifiedMaxPeers.value !== inproxyParameters.maxClients) {
            settingsChanged = true;
        } else if (
            MBToBytes(modifiedMaxMBps.value) !==
            inproxyParameters.limitUpstreamBytesPerSecond
        ) {
            settingsChanged = true;
        }
        return settingsChanged;
    });

    // Update opacity based on changes - separate from derived value to avoid writing during render
    useAnimatedReaction(
        () => changesPending.value,
        (current) => {
            if (current) {
                applyChangesNoteOpacity.value = withTiming(1, {
                    duration: 500,
                });
            } else {
                applyChangesNoteOpacity.value = 0;
            }
        },
    );

    function resetSettingsFromInproxyProvider() {
        modifiedMaxPeers.value = inproxyParameters.maxClients;
        modifiedMaxMBps.value = bytesToMB(
            inproxyParameters.limitUpstreamBytesPerSecond,
        );
    }
    React.useEffect(() => {
        resetSettingsFromInproxyProvider();
    }, [inproxyParameters]);

    async function updateInproxyMaxClients(newValue: number) {
        modifiedMaxPeers.value = newValue;
    }

    async function updateInproxyLimitBytesPerSecond(newValue: number) {
        // This value is configured as MBps in UI, so multiply out to raw bytes
        modifiedMaxMBps.value = newValue;
    }

    async function commitChanges() {
        const newInproxyParameters = InproxyParametersSchema.safeParse({
            maxClients: modifiedMaxPeers.value,
            limitUpstreamBytesPerSecond: MBToBytes(modifiedMaxMBps.value),
            limitDownstreamBytesPerSecond: MBToBytes(modifiedMaxMBps.value),
            privateKey: inproxyParameters.privateKey,
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

    // onSettingsClose has different behaviour depending on whether there are
    // pending changes to the settings, and if the inproxy is running or not.
    async function onSettingsClose() {
        applyChangesNoteOpacity.value = withTiming(0, { duration: 300 });
        if (changesPending.value) {
            if (inproxyStatus === "RUNNING") {
                // Since applying changes restarts inproxy, connections will be
                // lost, so we ask the user for confirmation about this.
                setDisplayRestartConfirmation(true);
            } else {
                await commitChanges();
                setModalOpen(false);
                setBgBlur(false);
            }
        } else {
            setModalOpen(false);
            setBgBlur(false);
        }
    }

    // Pass ref to ScrollView into the sliders so we don't start scrolling while
    // we're sliding.
    const scrollRef = React.useRef<ScrollView | null>(null);

    function Settings() {
        return (
            <View style={[ss.flex]}>
                <View
                    style={[
                        ss.padded,
                        ss.row,
                        ss.alignCenter,
                        ss.greyBorderBottom,
                    ]}
                >
                    <Pressable style={[ss.row]} onPress={onSettingsClose}>
                        <View
                            style={[ss.rounded20, ss.alignFlexStart, ss.padded]}
                        >
                            <Icon
                                name={"chevron-down"}
                                color={palette.black}
                                size={30}
                            />
                        </View>
                        <Text style={[ss.blackText, ss.extraLargeFont]}>
                            {t("SETTINGS_I18N.string")}
                        </Text>
                    </Pressable>
                    <View style={[ss.row, ss.flex, ss.justifyFlexEnd]}>
                        <Animated.View
                            style={[
                                ss.column,
                                ss.alignCenter,
                                ss.nogap,
                                {
                                    opacity: applyChangesNoteOpacity,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    ss.bodyFont,
                                    ss.blackText,
                                    { fontSize: 12 },
                                ]}
                            >
                                {t("CHANGES_PENDING_I18N.string")}
                            </Text>
                            <Text
                                style={[
                                    ss.bodyFont,
                                    ss.blackText,
                                    { fontSize: 12 },
                                ]}
                            >
                                {t("CLOSE_TO_APPLY_I18N.string")}
                            </Text>
                        </Animated.View>
                    </View>
                </View>
                <GestureHandlerRootView>
                    <ScrollView
                        contentContainerStyle={{
                            width: "100%",
                        }}
                        ref={scrollRef}
                    >
                        <View>
                            <EditableNumberSlider
                                label={t("MAX_PEERS_I18N.string")}
                                originalValue={inproxyParameters.maxClients}
                                min={1}
                                max={INPROXY_MAX_CLIENTS_MAX}
                                style={[...lineItemStyle, ss.alignCenter]}
                                onChange={updateInproxyMaxClients}
                                scrollRef={scrollRef}
                            />
                            <EditableNumberSlider
                                label={t("MAX_MBPS_PER_PEER_I18N.string")}
                                originalValue={bytesToMB(
                                    inproxyParameters.limitUpstreamBytesPerSecond,
                                )}
                                min={2}
                                max={INPROXY_MAX_MBPS_PER_PEER_MAX}
                                style={[...lineItemStyle, ss.alignCenter]}
                                onChange={updateInproxyLimitBytesPerSecond}
                                scrollRef={scrollRef}
                            />
                            <View
                                style={[
                                    ...lineItemStyle,
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
                            <View
                                style={[
                                    ss.greyBorderBottom,
                                    ss.flex,
                                    ss.alignCenter,
                                    ss.column,
                                    ss.padded,
                                ]}
                            >
                                <View
                                    style={[
                                        ss.row,
                                        ss.fullWidth,
                                        ss.justifySpaceBetween,
                                        ss.alignCenter,
                                    ]}
                                >
                                    <Text style={[ss.bodyFont, ss.blackText]}>
                                        {t("YOUR_CONDUIT_ID_I18N.string")}
                                    </Text>
                                    {conduitKeyPair ? (
                                        <ProxyID
                                            proxyId={getProxyId(conduitKeyPair)}
                                            copyable={false}
                                        />
                                    ) : (
                                        <ActivityIndicator
                                            size={"small"}
                                            color={palette.white}
                                        />
                                    )}
                                </View>
                                <View style={[ss.row, ss.flex, ss.alignCenter]}>
                                    <Text style={[ss.blackText, ss.bodyFont]}>
                                        {t("ALIAS_I18N.string")}:
                                    </Text>
                                    <ConduitName />
                                </View>
                            </View>
                            <View
                                style={[
                                    ...lineItemStyle,
                                    ss.flex,
                                    ss.alignCenter,
                                    ss.justifySpaceBetween,
                                ]}
                            >
                                <Text style={[ss.bodyFont, ss.blackText]}>
                                    {t("SEND_DIAGNOSTIC_I18N.string")}
                                </Text>
                                <SendDiagnosticButton />
                            </View>
                            {!["macos", "ios"].includes(Platform.OS) &&
                                notificationsPermission &&
                                notificationsPermission != "GRANTED" && (
                                    <View
                                        style={[
                                            ...lineItemStyle,
                                            ss.flex,
                                            ss.alignCenter,
                                            ss.justifySpaceBetween,
                                        ]}
                                    >
                                        <NotificationsStatus />
                                    </View>
                                )}
                            <View
                                style={[
                                    ...lineItemStyle,
                                    ss.flex,
                                    ss.alignCenter,
                                    ss.justifySpaceBetween,
                                ]}
                            >
                                <Text style={[ss.bodyFont, ss.blackText]}>
                                    {t("LEARN_MORE_I18N.string")}
                                </Text>
                                <Pressable
                                    onPress={() => {
                                        setModalOpen(false);
                                        setBgBlur(false);
                                        router.push("/(app)/onboarding");
                                    }}
                                >
                                    <View
                                        style={[
                                            ss.row,
                                            ss.alignCenter,
                                            ss.rounded5,
                                            ss.halfPadded,
                                            {
                                                backgroundColor: palette.white,
                                                borderWidth: 1,
                                                borderColor: palette.purple,
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={[ss.bodyFont, ss.purpleText]}
                                        >
                                            {t("REPLAY_INTRO_I18N.string")}
                                        </Text>
                                    </View>
                                </Pressable>
                            </View>
                            <View
                                style={[
                                    ss.height60,
                                    ss.flex,
                                    ss.alignCenter,
                                    ss.justifyCenter,
                                ]}
                            >
                                <PrivacyPolicyLink
                                    textStyle={{ ...ss.greyText }}
                                    containerHeight={60}
                                />
                            </View>
                        </View>
                    </ScrollView>
                </GestureHandlerRootView>
            </View>
        );
    }

    function RestartConfirmation() {
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
                            onPress={async () => {
                                Haptics.impactAsync(
                                    Haptics.ImpactFeedbackStyle.Medium,
                                );
                                await commitChanges();
                                setModalOpen(false);
                                setBgBlur(false);
                                setDisplayRestartConfirmation(false);
                            }}
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
                            onPress={() => {
                                resetSettingsFromInproxyProvider();
                                setDisplayRestartConfirmation(false);
                                setModalOpen(false);
                                setBgBlur(false);
                            }}
                        >
                            <Text
                                style={[ss.bodyFont, { color: palette.white }]}
                            >
                                {t("CANCEL_I18N.string")}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        );
    }

    // fadeIn on first load
    const fadeIn = useSharedValue(0);
    React.useEffect(() => {
        if (inproxyStatus !== "UNKNOWN") {
            fadeIn.value = withDelay(0, withTiming(0.8, { duration: 2000 }));
        }
    }, [inproxyStatus]);

    const settingsIconSize = win.width * 0.2;
    const paint = React.useMemo(() => Skia.Paint(), []);
    paint.setColorFilter(
        Skia.ColorFilter.MakeBlend(Skia.Color(palette.blue), BlendMode.SrcIn),
    );

    return (
        <>
            <View
                style={[
                    {
                        padding: 7,
                        bottom: 0,
                        right: 0,
                    },
                ]}
            >
                <Pressable
                    accessible={true}
                    accessibilityLabel={t("SETTINGS_I18N.string")}
                    accessibilityRole={"button"}
                    onPress={() => {
                        setModalOpen(true);
                        setBgBlur(true);
                    }}
                    style={{
                        justifyContent: "center",
                        alignItems: "center",
                        height: "100%",
                    }}
                >
                    <Icon
                        name="settings"
                        size={30}
                        color={palette.black}
                        opacity={fadeIn}
                        label={t("SETTINGS_I18N.string")}
                    />
                </Pressable>
            </View>
            <View
                style={[
                    ss.absolute,
                    ss.doublePadded,
                    {
                        bottom: 0,
                        right: settingsIconSize,
                        width: settingsIconSize,
                        height: settingsIconSize,
                    },
                ]}
            ></View>
            <Modal
                animationType="fade"
                visible={modalOpen}
                transparent={true}
                onRequestClose={onSettingsClose}
            >
                <View style={{ ...ss.modalBottom90, overflow: "hidden" }}>
                    <View
                        style={{
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            height: "100%",
                            width: "100%",
                            backgroundColor: "#FEFEFE",
                            opacity: 0.5,
                        }}
                    />

                    <View
                        style={{
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            height: "80%",
                            width: "100%",
                        }}
                    >
                        <InproxyStatusColorCanvas
                            width={win.width}
                            height={win.height * 0.8}
                            faderInitial={inproxyStatus === "RUNNING" ? 1 : 0}
                        />
                    </View>
                </View>
                <View style={[ss.modalBottom90]}>
                    {displayRestartConfirmation ? (
                        <RestartConfirmation />
                    ) : (
                        <Settings />
                    )}
                </View>
            </Modal>
        </>
    );
}

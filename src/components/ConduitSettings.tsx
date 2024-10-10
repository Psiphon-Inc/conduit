import {
    BlendMode,
    Canvas,
    LinearGradient,
    RoundedRect,
    Skia,
    vec,
} from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import Animated, {
    useDerivedValue,
    useSharedValue,
    withDelay,
    withTiming,
} from "react-native-reanimated";

import { useConduitKeyPair } from "@/src/auth/hooks";
import { wrapError } from "@/src/common/errors";
import { MBToBytes, bytesToMB } from "@/src/common/utils";
import { AnimatedText } from "@/src/components/AnimatedText";
import { EditableNumberSlider } from "@/src/components/EditableNumberSlider";
import { Icon } from "@/src/components/Icon";
import { NotificationsStatus } from "@/src/components/NotificationsStatus";
import { ProxyID } from "@/src/components/ProxyID";
import { SendDiagnosticButton } from "@/src/components/SendDiagnosticButton";
import {
    INPROXY_MAX_CLIENTS_MAX,
    INPROXY_MAX_MBPS_PER_PEER,
    PARTICLE_VIDEO_DELAY_MS,
} from "@/src/constants";
import { useInProxyContext } from "@/src/inproxy/context";
import { useInProxyStatus } from "@/src/inproxy/hooks";
import {
    InProxyParameters,
    InProxyParametersSchema,
} from "@/src/inproxy/types";
import { getProxyId } from "@/src/inproxy/utils";
import { lineItemStyle, palette, sharedStyles as ss } from "@/src/styles";
import { PrivacyPolicyLink } from "./PrivacyPolicyLink";

export function ConduitSettings() {
    const { t } = useTranslation();
    const win = useWindowDimensions();
    const router = useRouter();

    const conduitKeyPair = useConduitKeyPair();
    const { inProxyParameters, selectInProxyParameters, logErrorToDiagnostic } =
        useInProxyContext();
    const { data: inProxyStatus } = useInProxyStatus();

    const [modalOpen, setModalOpen] = React.useState(false);
    const [displayRestartConfirmation, setDisplayRestartConfirmation] =
        React.useState(false);

    const modifiedMaxPeers = useSharedValue(inProxyParameters.maxClients);
    const modifiedMaxMBps = useSharedValue(
        bytesToMB(inProxyParameters.limitUpstreamBytesPerSecond),
    );
    const displayTotalMBps = useDerivedValue(() => {
        return `${modifiedMaxPeers.value * modifiedMaxMBps.value} MB/s`;
    });
    const applyChangesNoteOpacity = useSharedValue(0);
    const changesPending = useDerivedValue(() => {
        let settingsChanged = false;
        if (modifiedMaxPeers.value !== inProxyParameters.maxClients) {
            settingsChanged = true;
        } else if (
            MBToBytes(modifiedMaxMBps.value) !==
            inProxyParameters.limitUpstreamBytesPerSecond
        ) {
            settingsChanged = true;
        }
        if (settingsChanged) {
            applyChangesNoteOpacity.value = withTiming(1, { duration: 500 });
        } else {
            applyChangesNoteOpacity.value = 0;
        }
        return settingsChanged;
    });

    function resetSettingsFromInProxyProvider() {
        modifiedMaxPeers.value = inProxyParameters.maxClients;
        modifiedMaxMBps.value = bytesToMB(
            inProxyParameters.limitUpstreamBytesPerSecond,
        );
    }
    React.useEffect(() => {
        resetSettingsFromInProxyProvider();
    }, [inProxyParameters]);

    async function updateInProxyMaxClients(newValue: number) {
        modifiedMaxPeers.value = newValue;
    }

    async function updateInProxyLimitBytesPerSecond(newValue: number) {
        // This value is configured as MBps in UI, so multiply out to raw bytes
        modifiedMaxMBps.value = newValue;
    }

    async function commitChanges() {
        const newInProxyParameters = InProxyParametersSchema.safeParse({
            maxClients: modifiedMaxPeers.value,
            limitUpstreamBytesPerSecond: MBToBytes(modifiedMaxMBps.value),
            limitDownstreamBytesPerSecond: MBToBytes(modifiedMaxMBps.value),
            privateKey: inProxyParameters.privateKey,
        } as InProxyParameters);
        if (newInProxyParameters.error) {
            logErrorToDiagnostic(
                wrapError(
                    newInProxyParameters.error,
                    "Error parsing updated InProxyParameters",
                ),
            );
            return;
        }
        selectInProxyParameters(newInProxyParameters.data);
    }

    async function onSettingsClose() {
        applyChangesNoteOpacity.value = withTiming(0, { duration: 300 });
        if (changesPending.value) {
            if (inProxyStatus === "RUNNING") {
                setDisplayRestartConfirmation(true);
            } else {
                await commitChanges();
                setModalOpen(false);
            }
        } else {
            setModalOpen(false);
        }
    }

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
                    <View style={[ss.row]}>
                        <Pressable
                            style={[ss.rounded20, ss.alignFlexStart, ss.padded]}
                            onPress={onSettingsClose}
                        >
                            <Icon
                                name={"chevron-down"}
                                color={palette.white}
                                size={30}
                            />
                        </Pressable>
                        <Text style={[ss.whiteText, ss.extraLargeFont]}>
                            {t("SETTINGS_I18N.string")}
                        </Text>
                    </View>
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
                                    ss.whiteText,
                                    { fontSize: 12 },
                                ]}
                            >
                                {t("CHANGES_PENDING_I18N.string")}
                            </Text>
                            <Text
                                style={[
                                    ss.bodyFont,
                                    ss.whiteText,
                                    { fontSize: 12 },
                                ]}
                            >
                                {t("CLOSE_TO_APPLY_I18N.string")}
                            </Text>
                        </Animated.View>
                    </View>
                </View>
                <ScrollView
                    contentContainerStyle={{
                        width: "100%",
                    }}
                >
                    <View>
                        <EditableNumberSlider
                            label={t("MAX_PEERS_I18N.string")}
                            originalValue={inProxyParameters.maxClients}
                            min={1}
                            max={INPROXY_MAX_CLIENTS_MAX}
                            style={[...lineItemStyle, ss.alignCenter]}
                            onChange={updateInProxyMaxClients}
                        />
                        <EditableNumberSlider
                            label={t("MAX_MBPS_PER_PEER_I18N.string")}
                            originalValue={bytesToMB(
                                inProxyParameters.limitUpstreamBytesPerSecond,
                            )}
                            min={8}
                            max={INPROXY_MAX_MBPS_PER_PEER}
                            style={[...lineItemStyle, ss.alignCenter]}
                            onChange={updateInProxyLimitBytesPerSecond}
                        />
                        <View
                            style={[
                                ...lineItemStyle,
                                ss.flex,
                                ss.alignCenter,
                                ss.justifySpaceBetween,
                            ]}
                        >
                            <Text style={[ss.bodyFont, ss.whiteText]}>
                                {t("REQUIRED_BANDWIDTH_I18N.string")}
                            </Text>
                            <AnimatedText
                                text={displayTotalMBps}
                                color={palette.white}
                                fontFamily={ss.bodyFont.fontFamily}
                                fontSize={ss.bodyFont.fontSize}
                            />
                        </View>
                        <View
                            style={[
                                ...lineItemStyle,
                                ss.flex,
                                ss.alignCenter,
                                ss.justifySpaceBetween,
                            ]}
                        >
                            <Text style={[ss.bodyFont, ss.whiteText]}>
                                {t("YOUR_ID_I18N.string")}
                            </Text>
                            {conduitKeyPair.data ? (
                                <ProxyID
                                    proxyId={getProxyId(conduitKeyPair.data)}
                                />
                            ) : (
                                <ActivityIndicator
                                    size={"small"}
                                    color={palette.white}
                                />
                            )}
                        </View>
                        <View
                            style={[
                                ...lineItemStyle,
                                ss.flex,
                                ss.alignCenter,
                                ss.justifySpaceBetween,
                            ]}
                        >
                            <Text style={[ss.bodyFont, ss.whiteText]}>
                                {t("SEND_DIAGNOSTIC_I18N.string")}
                            </Text>
                            <SendDiagnosticButton />
                        </View>
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
                        <View
                            style={[
                                ...lineItemStyle,
                                ss.flex,
                                ss.alignCenter,
                                ss.justifyCenter,
                            ]}
                        >
                            <View style={[ss.flex]} />
                            <Pressable
                                onPress={() => {
                                    setModalOpen(false);
                                    router.push("/(app)/intro");
                                }}
                            >
                                <Text style={[ss.bodyFont, ss.whiteText]}>
                                    {t("REPLAY_INTRO_I18N.string")}
                                </Text>
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
                    <Text style={[ss.whiteText, ss.bodyFont]}>
                        {t(
                            "SETTINGS_CHANGE_WILL_RESTART_CONDUIT_DESCRIPTION_I18N.string",
                        )}
                    </Text>
                    <Text style={[ss.whiteText, ss.bodyFont]}>
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
                                resetSettingsFromInProxyProvider();
                                setDisplayRestartConfirmation(false);
                                setModalOpen(false);
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
    if (inProxyStatus !== "UNKNOWN") {
        fadeIn.value = withDelay(
            inProxyStatus === "STOPPED" ? PARTICLE_VIDEO_DELAY_MS : 0,
            withTiming(0.8, { duration: 2000 }),
        );
    }

    const settingsIconSize = win.width * 0.2;
    const paint = React.useMemo(() => Skia.Paint(), []);
    paint.setColorFilter(
        Skia.ColorFilter.MakeBlend(Skia.Color(palette.blue), BlendMode.SrcIn),
    );

    return (
        <>
            <View
                style={[
                    ss.absolute,
                    ss.doublePadded,
                    {
                        bottom: 0,
                        right: 0,
                        width: settingsIconSize,
                        height: settingsIconSize,
                    },
                ]}
            >
                <Pressable
                    accessible={true}
                    accessibilityLabel={t("SETTINGS_I18N.string")}
                    accessibilityRole={"button"}
                    onPress={() => {
                        setModalOpen(true);
                    }}
                >
                    <Icon
                        name="settings"
                        size={settingsIconSize - ss.doublePadded.padding * 2}
                        color={palette.blueTint2}
                        opacity={fadeIn}
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
            >
                <Pressable
                    onPress={() => {
                        router.navigate("/(app)/onboarding");
                    }}
                >
                    <Icon
                        name="question"
                        size={settingsIconSize - ss.doublePadded.padding * 2}
                        color={palette.blueTint2}
                        opacity={fadeIn}
                    />
                </Pressable>
            </View>
            {/* this empty modal fades in the opacity overlay */}
            <Modal
                animationType="fade"
                visible={modalOpen}
                transparent={true}
                onRequestClose={onSettingsClose}
            >
                <View style={[ss.underlay]} />
            </Modal>
            {/* this modal has the settings menu and slides up */}
            <Modal
                animationType="slide"
                visible={modalOpen}
                transparent={true}
                onRequestClose={onSettingsClose}
            >
                <View style={[ss.modalHalfBottom]}>
                    <Canvas style={[ss.flex]}>
                        <RoundedRect
                            x={0}
                            y={0}
                            width={win.width}
                            height={win.height}
                            r={20}
                        >
                            <LinearGradient
                                start={vec(win.width / 2, 0)}
                                end={vec(win.width / 2, win.height)}
                                colors={[
                                    palette.blue,
                                    palette.purple,
                                    palette.black,
                                    palette.black,
                                    palette.black,
                                ]}
                            />
                        </RoundedRect>
                    </Canvas>
                </View>
                <View style={[ss.modalHalfBottom]}>
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

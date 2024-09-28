import { Feather } from "@expo/vector-icons";
import {
    BlendMode,
    Canvas,
    ColorMatrix,
    Group,
    ImageSVG,
    LinearGradient,
    Paint,
    RoundedRect,
    Skia,
    useSVG,
    vec,
} from "@shopify/react-native-skia";
import * as Linking from "expo-linking";
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
import {
    useDerivedValue,
    useSharedValue,
    withDelay,
    withTiming,
} from "react-native-reanimated";

import { useAccountContext } from "@/src/account/context";
import { wrapError } from "@/src/common/errors";
import { MBToBytes, bytesToMB } from "@/src/common/utils";
import { EditableNumberSlider } from "@/src/components/EditableNumberSlider";
import { NotificationsStatus } from "@/src/components/NotificationsStatus";
import { ProxyID } from "@/src/components/ProxyID";
import { PARTICLE_VIDEO_DELAY_MS, PRIVACY_POLICY_URL } from "@/src/constants";
import { useInProxyContext } from "@/src/inproxy/context";
import { useInProxyStatus } from "@/src/inproxy/hooks";
import { InProxyParametersSchema } from "@/src/inproxy/types";
import { getProxyId } from "@/src/inproxy/utils";
import {
    iconButton,
    lineItemStyle,
    palette,
    sharedStyles as ss,
} from "@/src/styles";

// TODO: better way to make a copy?
function makeCopy(data: any) {
    return JSON.parse(JSON.stringify(data));
}

export function ConduitSettings() {
    const { t } = useTranslation();
    const win = useWindowDimensions();
    const { conduitKeyPair } = useAccountContext();
    const {
        inProxyParameters,
        selectInProxyParameters,
        sendFeedback,
        logErrorToDiagnostic,
    } = useInProxyContext();

    const { data: inProxyStatus } = useInProxyStatus();

    const [modalOpen, setModalOpen] = React.useState(false);
    const [sendDiagnosticIcon, setSendDiagnosticIcon] = React.useState(
        <Feather name="send" size={24} color={palette.black} />,
    );
    const [displayTotalMaxMbps, setDisplayTotalMaxMbps] = React.useState(
        bytesToMB(inProxyParameters.limitUpstreamBytesPerSecond) *
            inProxyParameters.maxClients,
    );
    const [displayRestartConfirmation, setDisplayRestartConfirmation] =
        React.useState(false);

    const [modifiedInProxyParameters, setModifiedInProxyParameters] =
        React.useState(makeCopy(inProxyParameters));
    React.useEffect(() => {
        // need to update modified in proxy params whenever they change, since
        // we start from a default set
        setModifiedInProxyParameters(makeCopy(inProxyParameters));
        setDisplayTotalMaxMbps(
            bytesToMB(inProxyParameters.limitUpstreamBytesPerSecond) *
                inProxyParameters.maxClients,
        );
    }, [inProxyParameters]);

    async function updateInProxyMaxClients(newValue: number) {
        modifiedInProxyParameters.maxClients = newValue;
        setModifiedInProxyParameters(modifiedInProxyParameters);
        setDisplayTotalMaxMbps(
            bytesToMB(
                newValue *
                    modifiedInProxyParameters.limitUpstreamBytesPerSecond,
            ),
        );
    }

    async function updateInProxyLimitBytesPerSecond(newValue: number) {
        // This value is configured as MBps in UI, so multiply out to raw bytes
        modifiedInProxyParameters.limitUpstreamBytesPerSecond =
            MBToBytes(newValue);
        modifiedInProxyParameters.limitDownstreamBytesPerSecond =
            MBToBytes(newValue);
        setModifiedInProxyParameters(modifiedInProxyParameters);
        setDisplayTotalMaxMbps(newValue * modifiedInProxyParameters.maxClients);
    }

    async function commitChanges() {
        const newInProxyParameters = InProxyParametersSchema.safeParse(
            modifiedInProxyParameters,
        );
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
        let settingsChanged = false;
        if (
            modifiedInProxyParameters.maxClients !==
            inProxyParameters.maxClients
        ) {
            settingsChanged = true;
        } else if (
            modifiedInProxyParameters.limitUpstreamBytesPerSecond !==
            inProxyParameters.limitUpstreamBytesPerSecond
        ) {
            settingsChanged = true;
        }
        if (settingsChanged) {
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
                    <Pressable
                        style={[
                            ss.rounded20,
                            ss.alignFlexStart,
                            ss.justifyFlexStart,
                        ]}
                        onPress={onSettingsClose}
                    >
                        <Feather
                            name={"chevron-down"}
                            color={palette.white}
                            size={60}
                        />
                    </Pressable>
                    <Text style={[ss.whiteText, ss.extraLargeFont]}>
                        {t("SETTINGS_I18N.string")}
                    </Text>
                </View>
                <ScrollView
                    contentContainerStyle={{
                        width: "100%",
                    }}
                >
                    <View>
                        <EditableNumberSlider
                            label={t("MAX_PEERS_I18N.string")}
                            originalValue={modifiedInProxyParameters.maxClients}
                            min={1}
                            max={30}
                            step={1}
                            style={[...lineItemStyle, ss.alignCenter]}
                            onCommit={updateInProxyMaxClients}
                        />
                        <EditableNumberSlider
                            label={t("MBPS_PER_PEER_I18N.string")}
                            originalValue={bytesToMB(
                                modifiedInProxyParameters.limitUpstreamBytesPerSecond,
                            )}
                            min={8}
                            max={100}
                            step={2}
                            style={[...lineItemStyle, ss.alignCenter]}
                            onCommit={updateInProxyLimitBytesPerSecond}
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
                                {t("MAX_BANDWIDTH_USAGE_I18N.string")}
                            </Text>
                            <Text style={[ss.bodyFont, ss.whiteText]}>
                                {displayTotalMaxMbps} Mbps
                            </Text>
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
                            <Pressable
                                style={iconButton}
                                onPress={() => {
                                    sendFeedback();
                                    setSendDiagnosticIcon(
                                        <Feather
                                            name="check"
                                            size={24}
                                            color={palette.black}
                                        />,
                                    );
                                    setTimeout(() => {
                                        setSendDiagnosticIcon(
                                            <Feather
                                                name="send"
                                                size={24}
                                                color={palette.black}
                                            />,
                                        );
                                    }, 3000);
                                }}
                            >
                                {sendDiagnosticIcon}
                            </Pressable>
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
                    </View>
                </ScrollView>
                <Pressable
                    style={[
                        ss.absolute,
                        ss.row,
                        ss.fullWidth,
                        ss.justifyCenter,
                        { bottom: 0 },
                    ]}
                    onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
                >
                    <Text style={[ss.greyText, ss.bodyFont]}>
                        {t("PRIVACY_POLICY_I18N.string")}
                    </Text>
                </Pressable>
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

    const settingsIconSvg = useSVG(require("@/assets/images/settings.svg"));
    const settingsIconSize = win.width * 0.2;
    const paint = React.useMemo(() => Skia.Paint(), []);
    paint.setColorFilter(
        Skia.ColorFilter.MakeBlend(Skia.Color(palette.blue), BlendMode.SrcIn),
    );
    const opacityMatrix = useDerivedValue(() => {
        // prettier-ignore
        return [
     // R, G, B, A, Bias
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, fadeIn.value, 0,
    ];
    });

    return (
        <>
            <View
                style={[
                    ss.absolute,
                    {
                        bottom: 0,
                        right: 0,
                        width: settingsIconSize,
                        height: settingsIconSize,
                    },
                ]}
            >
                <Canvas style={[ss.flex]}>
                    <Group
                        layer={
                            <Paint>
                                <ColorMatrix matrix={opacityMatrix} />
                            </Paint>
                        }
                    >
                        <Group layer={paint}>
                            <ImageSVG
                                svg={settingsIconSvg}
                                width={settingsIconSize * 0.6}
                                height={settingsIconSize * 0.6}
                                y={settingsIconSize * 0.2}
                                x={settingsIconSize * 0.2}
                            />
                        </Group>
                    </Group>
                </Canvas>
                <Pressable
                    style={[ss.absoluteFill]}
                    onPress={() => {
                        setModalOpen(true);
                    }}
                />
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

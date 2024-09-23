import { FontAwesome, MaterialIcons } from "@expo/vector-icons";
import {
    BlendMode,
    Canvas,
    ColorMatrix,
    Group,
    ImageSVG,
    Paint,
    Skia,
    useSVG,
} from "@shopify/react-native-skia";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
    useWindowDimensions,
} from "react-native";

import { useAccountContext } from "@/src/account/context";
import { handleError, wrapError } from "@/src/common/errors";
import { MBToBytes, bytesToMB } from "@/src/common/utils";
import { EditableNumberSlider } from "@/src/components/EditableNumberSlider";
import { ProxyID } from "@/src/components/ProxyID";
import { useInProxyContext } from "@/src/inproxy/mockContext";
import { InProxyParametersSchema } from "@/src/inproxy/types";
import { getProxyId } from "@/src/inproxy/utils";
import { lineItemStyle, palette, sharedStyles as ss } from "@/src/styles";
import {
    useDerivedValue,
    useSharedValue,
    withDelay,
    withTiming,
} from "react-native-reanimated";

export function ConduitSettings() {
    const { t } = useTranslation();
    const win = useWindowDimensions();
    const { conduitKeyPair } = useAccountContext();
    const {
        inProxyParameters,
        selectInProxyParameters,
        getInProxyStatus,
        sendFeedback,
    } = useInProxyContext();

    const [modalOpen, setModalOpen] = React.useState(false);
    const [sendDiagnosticIcon, setSendDiagnosticIcon] = React.useState(
        <FontAwesome name="send" size={18} color={palette.white} />,
    );
    const [displayTotalMaxMbps, setDisplayTotalMaxMbps] = React.useState(
        bytesToMB(
            inProxyParameters.limitUpstreamBytesPerSecond *
                inProxyParameters.maxClients,
        ),
    );
    const [displayRestartConfirmation, setDisplayRestartConfirmation] =
        React.useState(false);

    // TODO: better way to make a copy?
    const [modifiedInProxyParameters, setModifiedInProxyParameters] =
        React.useState(JSON.parse(JSON.stringify(inProxyParameters)));
    React.useEffect(() => {
        // need to update modified in proxy params whenever they change, since
        // we start from a default set
        setModifiedInProxyParameters(
            JSON.parse(JSON.stringify(inProxyParameters)),
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
            handleError(
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
            if (getInProxyStatus() === "RUNNING") {
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
            <>
                <View
                    style={[
                        ss.padded,
                        ss.row,
                        ss.alignCenter,
                        ss.justifySpaceBetween,
                    ]}
                >
                    <Text style={[ss.whiteText, ss.bodyFont]}>
                        {t("EDIT_SETTINGS_I18N.string")}
                    </Text>
                    <Pressable
                        style={[
                            ss.padded,
                            ss.rounded20,
                            ss.alignFlexEnd,
                            ss.justifyFlexEnd,
                            { backgroundColor: palette.redTint2 },
                        ]}
                        onPress={onSettingsClose}
                    >
                        <Text style={[ss.whiteText, ss.bodyFont]}>
                            {t("DONE_I18N.string")}
                        </Text>
                    </Pressable>
                </View>
                <ScrollView
                    contentContainerStyle={{
                        width: "100%",
                    }}
                >
                    <View style={[]}>
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
                            <ProxyID proxyId={getProxyId(conduitKeyPair)} />
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
                                style={[
                                    ss.circle38,
                                    ss.alignCenter,
                                    ss.justifyCenter,
                                    {
                                        backgroundColor: palette.redTint2,
                                    },
                                ]}
                                onPress={() => {
                                    sendFeedback();
                                    setSendDiagnosticIcon(
                                        <MaterialIcons
                                            name="check"
                                            size={24}
                                            color={palette.white}
                                        />,
                                    );
                                    setTimeout(() => {
                                        setSendDiagnosticIcon(
                                            <FontAwesome
                                                name="send"
                                                size={18}
                                                color={palette.white}
                                            />,
                                        );
                                    }, 3000);
                                }}
                            >
                                {sendDiagnosticIcon}
                            </Pressable>
                        </View>
                    </View>
                </ScrollView>
            </>
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
                    ]}
                >
                    <Text style={[ss.whiteText, ss.bodyFont]}>
                        {t(
                            "SETTINGS_CHANGE_WILL_RESTART_CONDUIT_DESCRIPTION_I18N.string",
                        )}
                    </Text>
                    <View style={[ss.row]}>
                        <Pressable
                            style={[
                                ss.padded,
                                ss.rounded10,
                                { backgroundColor: palette.redTint2 },
                            ]}
                            onPress={async () => {
                                await commitChanges();
                                setModalOpen(false);
                                setDisplayRestartConfirmation(false);
                            }}
                        >
                            <Text style={[ss.whiteText, ss.bodyFont]}>
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
                                style={[
                                    ss.bodyFont,
                                    { color: palette.redTint2 },
                                ]}
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
        const inProxyStatus = getInProxyStatus();
        if (inProxyStatus === "RUNNING") {
            // fade in right away
            fadeIn.value = withTiming(1, { duration: 2000 });
        } else if (inProxyStatus === "STOPPED") {
            // fade in after a delay for particle animation
            fadeIn.value = withDelay(2800, withTiming(1, { duration: 2000 }));
        }
        // implicit do nothing on status unknown
    }, [getInProxyStatus]);

    const settingsIconSvg = useSVG(require("@/assets/images/settings.svg"));
    const settingsIconSize = win.width * 0.2;
    const paint = React.useMemo(() => Skia.Paint(), []);
    paint.setColorFilter(
        Skia.ColorFilter.MakeBlend(
            Skia.Color(palette.redTint2),
            BlendMode.SrcIn,
        ),
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
            <Modal animationType="fade" visible={modalOpen} transparent={true}>
                <View style={[ss.underlay]} />
            </Modal>
            {/* this modal has the settings menu and slides up */}
            <Modal animationType="slide" visible={modalOpen} transparent={true}>
                <View style={[ss.modalHalfBottom, ss.padded]}>
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

/*
 * Copyright (c) 2025, Psiphon Inc.
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
import { base64url } from "@scure/base";
import * as Linking from "expo-linking";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Modal,
    Platform,
    Pressable,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import { z } from "zod";

import { useConduitKeyPair } from "@/src/auth/hooks";
import { keyPairToBase64nopad } from "@/src/common/cryptography";
import { Icon } from "@/src/components/Icon";
import { QRDisplay } from "@/src/components/QRDisplay";
import { InproxyStatusColorCanvas } from "@/src/components/SkyBox";
import {
    RYVE_APP_LISTING_APPLE,
    RYVE_APP_LISTING_GOOGLE,
    RYVE_CLAIM_DEEP_LINK,
} from "@/src/constants";
import { useConduitName } from "@/src/hooks";
import { useInproxyStatus } from "@/src/inproxy/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

export const conduitScanData = z.object({
    version: z.number(),
    data: z.object({
        key: z.string().length(86, { message: "INVALID_QR_CODE_I18N.string" }),
        name: z.string().optional(),
    }),
});

export const conduitClaimDeepLink = z.string().startsWith(RYVE_CLAIM_DEEP_LINK);

export function RyveCallToAction({
    setBgBlur,
}: {
    setBgBlur: React.Dispatch<React.SetStateAction<boolean>>;
}) {
    const win = useWindowDimensions();
    const { t } = useTranslation();

    const [modalOpen, setModalOpen] = React.useState(false);
    const [qrRevealed, setQrRevealed] = React.useState(false);

    const conduitKeyPair = useConduitKeyPair();
    const conduitName = useConduitName();
    const inproxyStatus = useInproxyStatus();

    function onClose() {
        setModalOpen(false);
        setBgBlur(false);
        setQrRevealed(false); // Reset reveal state when modal closes
    }

    function ModalContent() {
        if (!conduitKeyPair.data) {
            return (
                <View
                    style={{
                        width: "100%",
                        height: "100%",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <Text style={[ss.bodyFont, ss.whiteText]}>
                        Loading conduit data...
                    </Text>
                </View>
            );
        }

        const keydata = keyPairToBase64nopad(conduitKeyPair.data);
        if (keydata instanceof Error) {
            return (
                <View
                    style={{
                        width: "100%",
                        height: "100%",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <Text style={[ss.bodyFont, ss.whiteText]}>
                        Error formatting keydata
                    </Text>
                </View>
            );
        }

        const data = conduitScanData.parse({
            version: 1,
            data: {
                key: keydata,
                name: conduitName.data,
            },
        } as z.infer<typeof conduitScanData>);

        const qrDeepLink = conduitClaimDeepLink.parse(
            `${RYVE_CLAIM_DEEP_LINK}${base64url.encode(new TextEncoder().encode(JSON.stringify(data)))}`,
        );

        return (
            <View
                style={[
                    ss.flex,
                    ss.column,
                    ss.alignCenter,
                    ss.justifySpaceBetween,
                    ss.doublePadded,
                    {
                        paddingTop: 60,
                        paddingBottom: 40,
                    },
                ]}
            >
                <View
                    style={[
                        ss.fullWidth,
                        ss.column,
                        ss.alignCenter,
                        ss.flex,
                        ss.justifyCenter,
                        { gap: 20 },
                    ]}
                >
                    <View
                        style={[
                            ss.padded,
                            {
                                borderRadius: 20,
                                borderWidth: 2,
                                borderColor: qrRevealed
                                    ? palette.black
                                    : palette.purple,
                                backgroundColor: qrRevealed
                                    ? palette.white
                                    : palette.transparent,
                            },
                        ]}
                    >
                        {qrRevealed ? (
                            <QRDisplay
                                backgroundColor={palette.white}
                                foregroundColor={palette.black}
                                size={win.width * 0.8}
                                data={qrDeepLink}
                            />
                        ) : (
                            <View
                                style={{
                                    width: win.width * 0.8,
                                    height: win.width * 0.8,
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <Text
                                    style={[
                                        ss.blackText,
                                        ss.bodyFont,
                                        ss.centeredText,
                                        { marginBottom: 20 },
                                    ]}
                                >
                                    {t("SCAN_THIS_FROM_RYVE_APP_I18N.string")}
                                </Text>
                                <Pressable
                                    style={[
                                        ss.alignCenter,
                                        ss.justifyCenter,
                                        {
                                            backgroundColor: palette.white,
                                            borderRadius: 100,
                                            borderWidth: 1,
                                            borderColor: palette.purple,
                                            paddingVertical: 12,
                                            paddingHorizontal: 24,
                                        },
                                    ]}
                                    onPress={() => setQrRevealed(true)}
                                >
                                    <Text style={[ss.purpleText, ss.bodyFont]}>
                                        {t("REVEAL_I18N.string")}
                                    </Text>
                                </Pressable>
                            </View>
                        )}
                    </View>
                    <Pressable
                        style={[
                            ss.row,
                            ss.fullWidth,
                            ss.alignCenter,
                            ss.justifyCenter,
                            {
                                backgroundColor: palette.white,
                                borderRadius: 100,
                                borderWidth: 1,
                                borderColor: palette.purple,
                                paddingVertical: 10,
                            },
                        ]}
                        onPress={() => {
                            Linking.openURL(
                                Platform.OS === "ios"
                                    ? RYVE_APP_LISTING_APPLE
                                    : RYVE_APP_LISTING_GOOGLE,
                            );
                        }}
                    >
                        <Text
                            style={[
                                ss.purpleText,
                                ss.bodyFont,
                                ss.centeredText,
                                { maxWidth: "80%" },
                            ]}
                        >
                            {t("GET_RYVE_I18N.string")}
                        </Text>
                        <Icon
                            name={"external-link"}
                            size={28}
                            color={palette.purple}
                        />
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
        <>
            <Pressable
                onPress={() => {
                    setModalOpen(true);
                    setBgBlur(true);
                }}
            >
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        borderRadius: 100,
                        width: "100%",
                        paddingHorizontal: 35,
                        paddingVertical: 10,
                        backgroundColor: palette.white,
                        borderColor: palette.purple,
                        borderWidth: 1,
                    }}
                >
                    <Text style={[ss.purpleText, ss.bodyFont]}>
                        {t("CLAIM_REWARDS_IN_RYVE_I18N.string")}
                    </Text>
                </View>
            </Pressable>
            <Modal
                animationType="fade"
                visible={modalOpen}
                transparent={true}
                onRequestClose={onClose}
            >
                <View
                    style={[
                        ss.modalBottom90,
                        {
                            overflow: "hidden",
                        },
                    ]}
                >
                    <InproxyStatusColorCanvas
                        width={win.width}
                        height={win.height}
                        faderInitial={
                            inproxyStatus.data &&
                            inproxyStatus.data === "RUNNING"
                                ? 1
                                : 0
                        }
                    />
                    <Pressable
                        style={[ss.row, ss.padded]}
                        onPress={() => {
                            setModalOpen(false);
                            setBgBlur(false);
                            setQrRevealed(false);
                        }}
                    >
                        <View
                            style={[ss.rounded20, ss.alignFlexStart, ss.padded]}
                        >
                            <Icon
                                name={"chevron-down"}
                                color={palette.black}
                                size={30}
                            />
                        </View>
                    </Pressable>
                    <ModalContent />
                </View>
            </Modal>
        </>
    );
}

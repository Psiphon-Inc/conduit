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
import { Canvas, LinearGradient, Rect, vec } from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { useConduitKeyPair } from "@/src/auth/hooks";
import { keyPairToBase64nopad } from "@/src/common/cryptography";
import { Icon } from "@/src/components/Icon";
import { useModal } from "@/src/components/ModalStore";
import { QRDisplay } from "@/src/components/QRDisplay";
import {
    RyveClaimMaterial,
    buildRyveClaimDeepLink,
    canOpenRyveClaimDeepLink,
    getRyveInstallUrl,
    resolvePreferredRyveName,
} from "@/src/components/ryveClaim";
import { useConduitName } from "@/src/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

const RYVE_GRADIENT_COLORS = ["#A475E3", "rgba(156, 129, 201, 0.69)"];

function RyveModalShell({
    children,
    onClose,
}: {
    children: React.ReactNode;
    onClose?: () => void;
}) {
    const { t } = useTranslation();
    const { closeModal } = useModal();
    const handleClose = onClose ?? closeModal;

    return (
        <Pressable
            onPress={handleClose}
            style={{
                flex: 1,
                justifyContent: "flex-end",
                backgroundColor: palette.modalBgOverlay,
            }}
        >
            <Pressable
                onPress={(event) => {
                    event.stopPropagation();
                }}
                style={[
                    ss.modalBottom90,
                    {
                        overflow: "hidden",
                        height: "75%",
                        backgroundColor: palette.white,
                    },
                ]}
            >
                <View
                    style={{
                        paddingTop: 12,
                        paddingHorizontal: 16,
                        paddingBottom: 4,
                        alignItems: "flex-end",
                    }}
                >
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t(
                            "CLOSE_RYVE_MODAL_ACCESSIBILITY_I18N.string",
                        )}
                        onPress={handleClose}
                        hitSlop={10}
                    >
                        <Icon
                            name="close"
                            color={palette.lightGrey}
                            size={22}
                        />
                    </Pressable>
                </View>
                <View style={{ flex: 1 }}>{children}</View>
            </Pressable>
        </Pressable>
    );
}

function RyveCenteredMessage({ message }: { message: string }) {
    return (
        <View
            style={{
                width: "100%",
                height: "100%",
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 24,
            }}
        >
            <Text style={[ss.bodyFont, ss.blackText, ss.centeredText]}>
                {message}
            </Text>
        </View>
    );
}

export function RyveClaimModalContent({
    claim,
    preferredName,
    openToQr,
    onClose,
}: {
    claim: RyveClaimMaterial;
    preferredName?: string;
    openToQr?: boolean;
    onClose?: () => void;
}) {
    const win = useWindowDimensions();
    const { t } = useTranslation();
    const conduitName = useConduitName();
    const resolvedPreferredName = resolvePreferredRyveName(
        preferredName,
        conduitName.data,
    );
    const claimDeepLink = React.useMemo(() => {
        const link = buildRyveClaimDeepLink(claim, resolvedPreferredName);
        return link;
    }, [claim, resolvedPreferredName]);

    const [qrRevealed, setQrRevealed] = React.useState(Boolean(openToQr));
    const [buttonWidth, setButtonWidth] = React.useState(0);
    const [canOpenInRyve, setCanOpenInRyve] = React.useState<boolean | null>(
        null,
    );

    const ryveInstallUrl = React.useMemo(() => getRyveInstallUrl(), []);

    React.useEffect(() => {
        let isMounted = true;

        void canOpenRyveClaimDeepLink(claimDeepLink).then((canOpen) => {
            if (!isMounted) {
                return;
            }
            setCanOpenInRyve(canOpen);
        });

        return () => {
            isMounted = false;
        };
    }, [claimDeepLink]);

    const handlePrimaryAction = React.useCallback(async () => {
        const installed = await canOpenRyveClaimDeepLink(claimDeepLink);
        setCanOpenInRyve(installed);

        if (installed) {
            await Linking.openURL(claimDeepLink);
            return;
        }

        console.log(
            "[RyveClaim] Ryve not installed, opening install URL:",
            ryveInstallUrl,
        );
        await Linking.openURL(ryveInstallUrl);
    }, [claimDeepLink, ryveInstallUrl]);

    const primaryActionLabel =
        canOpenInRyve === false
            ? t("GET_RYVE_I18N.string")
            : t("OPEN_IN_RYVE_I18N.string");

    return (
        <RyveModalShell onClose={onClose}>
            <View
                style={[
                    ss.flex,
                    ss.column,
                    ss.alignCenter,
                    {
                        flexDirection: "column",
                        gap: 20,
                        paddingHorizontal: 24,
                        paddingBottom: 24,
                    },
                ]}
            >
                <Text
                    style={[
                        ss.bodyFont,
                        ss.blackText,
                        ss.centeredText,
                        { fontSize: 22 },
                    ]}
                >
                    {t("CLAIM_REWARDS_I18N.string")}
                </Text>

                <Pressable
                    onPress={() => {
                        void handlePrimaryAction();
                    }}
                    onLayout={(event) => {
                        setButtonWidth(event.nativeEvent.layout.width);
                    }}
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 12,
                        height: 52,
                        overflow: "hidden",
                        gap: 10,
                        alignSelf: "stretch",
                    }}
                >
                    <View
                        style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            width: "100%",
                            height: "100%",
                        }}
                        pointerEvents="none"
                    >
                        <Canvas style={{ flex: 1 }}>
                            <Rect
                                x={0}
                                y={0}
                                width={Math.max(1, buttonWidth)}
                                height={52}
                            >
                                <LinearGradient
                                    start={vec(0, 26)}
                                    end={vec(Math.max(1, buttonWidth), 26)}
                                    colors={RYVE_GRADIENT_COLORS}
                                />
                            </Rect>
                        </Canvas>
                    </View>
                    <Text style={[ss.whiteText, ss.bodyFont, { fontSize: 24 }]}>
                        {primaryActionLabel}
                    </Text>
                    <Icon name="right-arrow" color={palette.white} size={20} />
                </Pressable>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                    }}
                >
                    <View
                        style={{
                            width: 20,
                            borderBottomWidth: 1,
                            borderBottomColor: palette.midGrey,
                        }}
                    />
                    <Text style={[ss.tinyFont, ss.greyText, ss.centeredText]}>
                        {t("OR_I18N.string")}
                    </Text>
                    <View
                        style={{
                            width: 20,
                            borderBottomWidth: 1,
                            borderBottomColor: palette.midGrey,
                        }}
                    />
                </View>

                <Text
                    style={[
                        ss.blackText,
                        ss.centeredText,
                        { fontSize: 18, fontFamily: "JuraRegular" },
                    ]}
                >
                    {t("SCAN_THIS_FROM_RYVE_APP_I18N.string")}
                </Text>

                {qrRevealed ? (
                    <Pressable onPress={() => setQrRevealed(false)}>
                        <QRDisplay
                            data={claimDeepLink}
                            size={Math.min(win.width * 0.8, 300)}
                        />
                    </Pressable>
                ) : (
                    <View
                        style={{
                            width: Math.min(win.width * 0.8, 300),
                            height: Math.min(win.width * 0.8, 300),
                            justifyContent: "center",
                            alignItems: "center",
                            borderRadius: 15,
                            overflow: "hidden",
                            borderWidth: 1,
                        }}
                    >
                        <Pressable
                            onPress={() => setQrRevealed(true)}
                            style={{
                                paddingVertical: 12,
                                paddingHorizontal: 24,
                                borderColor: palette.purple,
                                borderWidth: 1,
                                borderRadius: 12,
                            }}
                        >
                            <Text
                                style={[
                                    ss.bodyFont,
                                    {
                                        color: palette.purple,
                                        fontSize: 14,
                                    },
                                ]}
                            >
                                {t("REVEAL_QR_I18N.string")}
                            </Text>
                        </Pressable>
                    </View>
                )}
            </View>
        </RyveModalShell>
    );
}

function RyveModalContent({ openToQr }: { openToQr?: boolean }) {
    const { t } = useTranslation();
    const conduitKeyPair = useConduitKeyPair();

    if (!conduitKeyPair.data) {
        return (
            <RyveModalShell>
                <RyveCenteredMessage
                    message={t("LOADING_CONDUIT_DATA_I18N.string")}
                />
            </RyveModalShell>
        );
    }

    const keydata = keyPairToBase64nopad(conduitKeyPair.data);
    if (keydata instanceof Error) {
        return (
            <RyveModalShell>
                <RyveCenteredMessage
                    message={t("ERROR_FORMATTING_KEYDATA_I18N.string")}
                />
            </RyveModalShell>
        );
    }

    return (
        <RyveClaimModalContent
            claim={{ version: 1, key: keydata }}
            openToQr={openToQr}
        />
    );
}

export function RyveCallToAction({
    triggerLabel,
    compact,
    openToQr,
    renderTrigger,
}: {
    triggerLabel?: string;
    compact?: boolean;
    openToQr?: boolean;
    renderTrigger?: (onPress: () => void) => React.ReactNode;
}) {
    const { t } = useTranslation();
    const { openModal } = useModal();

    const handleOpen = React.useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        openModal(<RyveModalContent openToQr={openToQr} />);
    }, [openModal, openToQr]);

    if (renderTrigger) {
        return <>{renderTrigger(handleOpen)}</>;
    }

    return (
        <Pressable onPress={handleOpen}>
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    borderRadius: 100,
                    width: compact ? undefined : "100%",
                    paddingHorizontal: compact ? 16 : 35,
                    paddingVertical: 10,
                    backgroundColor: palette.white,
                    borderColor: palette.purple,
                    borderWidth: 1,
                }}
            >
                <Text style={[ss.purpleText, ss.bodyFont]}>
                    {triggerLabel ?? t("CLAIM_REWARDS_IN_RYVE_I18N.string")}
                </Text>
            </View>
        </Pressable>
    );
}

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
import { Canvas, LinearGradient, Rect, vec } from "@shopify/react-native-skia";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Share,
    Text,
    View,
} from "react-native";

import { normalizeLanguageCode } from "@/src/common/localeUtils";
import { isValidNickname, normalizeNickname } from "@/src/common/precis";
import { EditableConduitAlias } from "@/src/components/EditableConduitAlias";
import { Icon } from "@/src/components/Icon";
import { useModal } from "@/src/components/ModalStore";
import { ASYNCSTORAGE_PAIRING_LANGUAGE_KEY } from "@/src/constants";
import { useConduitName } from "@/src/hooks";
import { buildPairingShareOutput } from "@/src/hosted/conduits";
import { palette, sharedStyles as ss } from "@/src/styles";

interface LanguageOption {
    code: string;
    label: string;
}

interface LanguageCopy {
    shareMessage: string;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
    { code: "fa", label: "فارسی" },
    { code: "ar", label: "العربية" },
    { code: "en", label: "English" },
    { code: "tr", label: "Türkçe" },
    { code: "de", label: "Deutsch" },
    { code: "es", label: "Español" },
    { code: "fr", label: "Français" },
    { code: "hi", label: "हिन्दी" },
    { code: "id", label: "Bahasa Indonesia" },
    { code: "pt-BR", label: "Português (Brasil)" },
    { code: "pt-PT", label: "Português (Portugal)" },
    { code: "sw", label: "Kiswahili" },
    { code: "ur", label: "اردو" },
    { code: "vi", label: "Tiếng Việt" },
];

const LANGUAGE_COPY: Record<string, LanguageCopy> = {
    en: {
        shareMessage:
            "Open this link to connect to a trusted Conduit station. If the link is blocked, copy and paste it into the Psiphon App's Personal Pairing widget.",
    },
    ar: {
        shareMessage:
            "افتح هذا الرابط للاتصال بمحطة Conduit موثوقة. إذا كان الرابط محجوبًا، انسخه والصقه في أداة Personal Pairing داخل تطبيق Psiphon.",
    },
    fa: {
        shareMessage:
            "این لینک را باز کنید تا به یک ایستگاه Conduit مورد اعتماد متصل شوید. اگر لینک مسدود بود، آن را کپی کرده و در ویجت Personal Pairing برنامه Psiphon جای گذاری کنید.",
    },
    tr: {
        shareMessage:
            "Güvenilir bir Conduit istasyonuna bağlanmak için bu bağlantıyı açın. Bağlantı engellenirse Psiphon Uygulamasındaki Personal Pairing bileşenine kopyalayıp yapıştırın.",
    },
    de: {
        shareMessage:
            "Öffnen Sie diesen Link, um sich mit einer vertrauenswürdigen Conduit-Station zu verbinden. Wenn der Link blockiert ist, kopieren Sie ihn und fügen Sie ihn in das Personal-Pairing-Widget der Psiphon-App ein.",
    },
    es: {
        shareMessage:
            "Abra este enlace para conectarse a una estación de Conduit de confianza. Si el enlace está bloqueado, cópielo y péguelo en el widget de Emparejamiento personal de la aplicación Psiphon.",
    },
    fr: {
        shareMessage:
            "Ouvrez ce lien pour vous connecter à une station Conduit de confiance. Si le lien est bloqué, copiez-le et collez-le dans le widget de jumelage personnel de l’application Psiphon.",
    },
    hi: {
        shareMessage:
            "किसी विश्वसनीय Conduit स्टेशन से जुड़ने के लिए इस लिंक को खोलें। यदि लिंक ब्लॉक हो, तो इसे कॉपी करके Psiphon ऐप के Personal Pairing विजेट में पेस्ट करें।",
    },
    id: {
        shareMessage:
            "Buka tautan ini untuk terhubung ke stasiun Conduit tepercaya. Jika tautan diblokir, salin lalu tempelkan ke widget Personal Pairing di aplikasi Psiphon.",
    },
    "pt-BR": {
        shareMessage:
            "Abra este link para se conectar a uma estação Conduit confiável. Se o link estiver bloqueado, copie e cole no widget de Pareamento Pessoal do app Psiphon.",
    },
    "pt-PT": {
        shareMessage:
            "Abra esta ligação para se ligar a uma estação Conduit de confiança. Se a ligação estiver bloqueada, copie-a e cole-a no widget de Emparelhamento Pessoal da aplicação Psiphon.",
    },
    sw: {
        shareMessage:
            "Fungua kiungo hiki ili kuunganisha kwenye kituo cha Conduit kinachoaminika. Ikiwa kiungo kimezuiwa, nakili na ubandike kwenye wijeti ya Personal Pairing ndani ya programu ya Psiphon.",
    },
    ur: {
        shareMessage:
            "قابلِ اعتماد Conduit اسٹیشن سے جڑنے کے لیے یہ لنک کھولیں۔ اگر لنک بلاک ہو تو اسے کاپی کریں اور Psiphon ایپ کے Personal Pairing ویجیٹ میں پیسٹ کریں۔",
    },
    vi: {
        shareMessage:
            "Mở liên kết này để kết nối với một trạm Conduit đáng tin cậy. Nếu liên kết bị chặn, hãy sao chép và dán vào tiện ích Personal Pairing trong ứng dụng Psiphon.",
    },
};

const PRIMARY_GRADIENT_COLORS = ["#A475E3", "rgba(156, 129, 201, 0.69)"];

export function PersonalPairingShareModal({
    personalCompartmentId,
    wrapperBaseUrl,
}: {
    personalCompartmentId: string | null;
    wrapperBaseUrl?: string | null;
}) {
    const { t, i18n } = useTranslation();
    const { data: storedConduitName } = useConduitName();
    const { closeModal, pushModal } = useModal();

    const [selectedLanguage, setSelectedLanguageState] = React.useState("en");
    const [shareButtonWidth, setShareButtonWidth] = React.useState(0);
    const [notice, setNotice] = React.useState<string | null>(null);

    const normalizedName = normalizeNickname(storedConduitName ?? "");
    const hasValidName =
        normalizedName.length > 0 && isValidNickname(normalizedName);

    React.useEffect(() => {
        void AsyncStorage.getItem(ASYNCSTORAGE_PAIRING_LANGUAGE_KEY).then(
            (stored) => {
                const validCodes = LANGUAGE_OPTIONS.map((o) => o.code);
                if (stored && validCodes.includes(stored)) {
                    setSelectedLanguageState(stored);
                } else {
                    const initialLanguage = normalizeLanguageCode(
                        i18n.language,
                        validCodes,
                    );
                    setSelectedLanguageState(initialLanguage);
                }
            },
        );
    }, [i18n.language]);

    const languageCopy = LANGUAGE_COPY[selectedLanguage] ?? LANGUAGE_COPY.en;
    const selectedLanguageLabel =
        LANGUAGE_OPTIONS.find((option) => option.code === selectedLanguage)
            ?.label ??
        LANGUAGE_OPTIONS[0]?.label ??
        "English";

    async function sharePairingLink(): Promise<void> {
        if (!personalCompartmentId) {
            setNotice(t("PERSONAL_PAIRING_NOT_READY_I18N.string"));
            return;
        }

        const pairingName = normalizeNickname(storedConduitName ?? "");
        if (!pairingName || !isValidNickname(pairingName)) {
            setNotice(t("PERSONAL_PAIRING_INVALID_NAME_I18N.string"));
            return;
        }

        const shareOutput = buildPairingShareOutput(
            personalCompartmentId,
            pairingName,
            wrapperBaseUrl,
        );
        const shareLink = shareOutput.wrapperUrl ?? shareOutput.deepLink;
        const shareMessage = `${languageCopy.shareMessage}\n\n${shareLink}\n${shareOutput.rawToken}`;

        try {
            await Share.share({ message: shareMessage });
            setNotice(null);
        } catch {
            await Clipboard.setStringAsync(shareOutput.rawToken);
            setNotice(t("SHARE_UNAVAILABLE_TOKEN_COPIED_I18N.string"));
        }
    }

    const handleClose = React.useCallback(() => {
        closeModal();
    }, [closeModal]);

    const openLanguagePicker = React.useCallback(() => {
        pushModal(
            <LanguagePickerModal
                languages={LANGUAGE_OPTIONS}
                selected={selectedLanguage}
            />,
        );
    }, [pushModal, selectedLanguage]);

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
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
                            maxHeight: "64%",
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
                                "CLOSE_PERSONAL_PAIRING_ACCESSIBILITY_I18N.string",
                            )}
                            onPress={handleClose}
                            hitSlop={10}
                            style={{}}
                        >
                            <Icon
                                name="close"
                                color={palette.lightGrey}
                                size={22}
                            />
                        </Pressable>
                    </View>

                    <ScrollView
                        contentContainerStyle={[
                            ss.doublePadded,
                            {
                                flexGrow: 1,
                                paddingTop: 12,
                                paddingBottom: 24,
                            },
                        ]}
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={[ss.column, { gap: 18 }]}>
                            <Text
                                style={[
                                    ss.bodyFont,
                                    ss.blackText,
                                    ss.centeredText,
                                    { fontSize: 22 },
                                ]}
                            >
                                {t("PERSONAL_PAIRING_TITLE_I18N.string")}
                            </Text>

                            <Text
                                style={[
                                    ss.blackText,
                                    {
                                        fontSize: 18,
                                        fontFamily: "JuraRegular",
                                    },
                                ]}
                            >
                                {t("PERSONAL_PAIRING_DESCRIPTION_I18N.string")}
                            </Text>

                            <EditableConduitAlias
                                fallbackName={t(
                                    "DEFAULT_CONDUIT_NAME_I18N.string",
                                )}
                                fontSize={18}
                            />

                            {!hasValidName ? (
                                <Text
                                    style={[
                                        ss.bodyFont,
                                        {
                                            color: palette.red,
                                            marginTop: -10,
                                        },
                                    ]}
                                >
                                    {t("STATION_NAME_REQUIRED_I18N.string")}
                                </Text>
                            ) : null}

                            <View style={[ss.column, { gap: 8 }]}>
                                <View
                                    style={{
                                        flexDirection: "row",
                                        alignItems: "flex-start",
                                        justifyContent: "space-between",
                                        gap: 12,
                                    }}
                                >
                                    <Text
                                        style={[
                                            ss.bodyFont,
                                            {
                                                color: "rgba(35, 31, 32, 0.56)",
                                                fontSize: 17,
                                                paddingTop: 10,
                                            },
                                        ]}
                                    >
                                        {t("SHARE_IN_I18N.string")}
                                    </Text>
                                    <Pressable
                                        onPress={openLanguagePicker}
                                        style={{
                                            width: 224,
                                            flexDirection: "row",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            borderWidth: 1,
                                            borderColor: palette.purple,
                                            borderRadius: 8,
                                            backgroundColor: palette.white,
                                            paddingHorizontal: 14,
                                            height: 48,
                                        }}
                                    >
                                        <Text
                                            style={[
                                                ss.bodyFont,
                                                ss.blackText,
                                                { fontSize: 20 },
                                            ]}
                                        >
                                            {selectedLanguageLabel}
                                        </Text>
                                        <Icon
                                            name="chevron-down"
                                            color={palette.lightGrey}
                                            size={18}
                                        />
                                    </Pressable>
                                </View>
                            </View>
                        </View>

                        <View
                            style={{
                                marginTop: "auto",
                                gap: 10,
                                marginBottom: 12,
                            }}
                        >
                            <Pressable
                                onLayout={(event) => {
                                    setShareButtonWidth(
                                        event.nativeEvent.layout.width,
                                    );
                                }}
                                disabled={!hasValidName}
                                onPress={() => {
                                    void sharePairingLink();
                                }}
                                style={[
                                    ss.row,
                                    ss.alignCenter,
                                    ss.justifyCenter,
                                    {
                                        alignSelf: "stretch",
                                        borderRadius: 12,
                                        backgroundColor: palette.transparent,
                                        height: 52,
                                        marginTop: 4,
                                        overflow: "hidden",
                                        opacity: hasValidName ? 1 : 0.4,
                                    },
                                ]}
                            >
                                <View
                                    style={[ss.absoluteFill]}
                                    pointerEvents="none"
                                >
                                    <Canvas style={{ flex: 1 }}>
                                        <Rect
                                            x={0}
                                            y={0}
                                            width={Math.max(
                                                1,
                                                shareButtonWidth,
                                            )}
                                            height={52}
                                        >
                                            <LinearGradient
                                                start={vec(0, 26)}
                                                end={vec(
                                                    Math.max(
                                                        1,
                                                        shareButtonWidth,
                                                    ),
                                                    26,
                                                )}
                                                colors={PRIMARY_GRADIENT_COLORS}
                                            />
                                        </Rect>
                                    </Canvas>
                                </View>
                                <Image
                                    source={require("@/assets/images/icons/share.svg")}
                                    tintColor={palette.white}
                                    style={{ width: 22, height: 22 }}
                                    contentFit="contain"
                                />
                                <Text
                                    style={[
                                        ss.whiteText,
                                        ss.bodyFont,
                                        { fontSize: 24 },
                                    ]}
                                >
                                    {t("SHARE_LINK_I18N.string")}
                                </Text>
                            </Pressable>

                            {notice ? (
                                <Text
                                    style={[
                                        ss.tinyFont,
                                        ss.blackText,
                                        ss.centeredText,
                                    ]}
                                >
                                    {notice}
                                </Text>
                            ) : null}
                        </View>
                    </ScrollView>
                </Pressable>
            </Pressable>
        </KeyboardAvoidingView>
    );
}

function LanguagePickerModal({
    languages,
    selected,
}: {
    languages: LanguageOption[];
    selected: string;
}) {
    const { t } = useTranslation();
    const { popModal } = useModal();

    return (
        <Pressable
            onPress={() => popModal()}
            style={{
                flex: 1,
                justifyContent: "flex-end",
                backgroundColor: palette.modalBgOverlay,
            }}
        >
            <Pressable
                onPress={(e) => e.stopPropagation()}
                style={{
                    backgroundColor: palette.white,
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    paddingTop: 12,
                    paddingBottom: 40,
                    maxHeight: "70%",
                }}
            >
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingHorizontal: 20,
                        paddingBottom: 12,
                    }}
                >
                    <Text style={[ss.bodyFont, ss.blackText, { fontSize: 18 }]}>
                        {t("SHARE_IN_I18N.string")}
                    </Text>
                    <Pressable onPress={() => popModal()} hitSlop={10}>
                        <Icon
                            name="close"
                            color={palette.lightGrey}
                            size={22}
                        />
                    </Pressable>
                </View>
                <ScrollView>
                    {languages.map((option) => {
                        const isSelected = option.code === selected;
                        return (
                            <Pressable
                                key={option.code}
                                onPress={() => {
                                    void AsyncStorage.setItem(
                                        ASYNCSTORAGE_PAIRING_LANGUAGE_KEY,
                                        option.code,
                                    );
                                    popModal();
                                }}
                                style={{
                                    paddingHorizontal: 24,
                                    paddingVertical: 14,
                                    backgroundColor: isSelected
                                        ? palette.purpleTint5
                                        : palette.white,
                                }}
                            >
                                <Text
                                    style={[
                                        ss.bodyFont,
                                        ss.blackText,
                                        {
                                            fontSize: 20,
                                            color: isSelected
                                                ? palette.purple
                                                : palette.black,
                                        },
                                    ]}
                                >
                                    {option.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </Pressable>
        </Pressable>
    );
}

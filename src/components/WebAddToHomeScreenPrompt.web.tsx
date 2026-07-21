import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import {
    isIOSWebDevice,
    isWebAppStandalone,
} from "@/src/common/webInstallPrompt";
import { Icon } from "@/src/components/Icon";
import { useModal } from "@/src/components/ModalStore";
import { ASYNCSTORAGE_WEB_ADD_TO_HOME_SCREEN_PROMPT_SEEN_KEY } from "@/src/constants";
import { palette, sharedStyles as ss } from "@/src/styles";

export function WebAddToHomeScreenPromptController({
    disabled = false,
}: {
    disabled?: boolean;
}) {
    const { openModal, isOpen } = useModal();
    const didCheckRef = React.useRef(false);

    React.useEffect(() => {
        if (
            disabled ||
            didCheckRef.current ||
            isOpen ||
            !isIOSWebDevice() ||
            isWebAppStandalone()
        ) {
            return;
        }

        didCheckRef.current = true;
        let cancelled = false;
        void AsyncStorage.getItem(
            ASYNCSTORAGE_WEB_ADD_TO_HOME_SCREEN_PROMPT_SEEN_KEY,
        ).then((seen) => {
            if (cancelled || seen || isWebAppStandalone()) {
                return;
            }

            openModal(<WebAddToHomeScreenModal />);
        });

        return () => {
            cancelled = true;
        };
    }, [disabled, isOpen, openModal]);

    return null;
}

export function WebAddToHomeScreenModal() {
    const { t } = useTranslation();
    const { closeModal } = useModal();
    const win = useWindowDimensions();
    const modalWidth = Math.min(win.width - 32, 420);

    async function rememberPromptSeen(): Promise<void> {
        await AsyncStorage.setItem(
            ASYNCSTORAGE_WEB_ADD_TO_HOME_SCREEN_PROMPT_SEEN_KEY,
            "true",
        );
    }

    async function dismiss(): Promise<void> {
        await rememberPromptSeen();
        closeModal();
    }

    return (
        <Pressable
            onPress={() => void dismiss()}
            style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: palette.modalBgOverlay,
                paddingHorizontal: 16,
            }}
        >
            <Pressable
                onPress={(event) => event.stopPropagation()}
                style={{
                    width: modalWidth,
                    borderRadius: 24,
                    backgroundColor: palette.white,
                    padding: 24,
                    gap: 18,
                    alignItems: "center",
                }}
            >
                <ExpoImage
                    source={require("@/assets/images/conduit-launcher.png")}
                    style={{ width: 82, height: 82, borderRadius: 18 }}
                    contentFit="cover"
                />

                <View style={{ gap: 10 }}>
                    <Text
                        style={[
                            ss.bodyFont,
                            ss.blackText,
                            ss.centeredText,
                            { fontSize: 24 },
                        ]}
                    >
                        {t("ADD_TO_HOME_SCREEN_MODAL_TITLE_I18N.string")}
                    </Text>
                    <Text
                        style={[
                            ss.bodyFont,
                            ss.blackText,
                            ss.centeredText,
                            { fontFamily: "JuraRegular", fontSize: 17 },
                        ]}
                    >
                        {t("ADD_TO_HOME_SCREEN_MODAL_BODY_I18N.string")}
                    </Text>
                    <Text
                        style={[
                            ss.tinyFont,
                            ss.blackText,
                            {
                                alignSelf: "center",
                                opacity: 0.7,
                                textAlign: "left",
                            },
                        ]}
                    >
                        {t("ADD_TO_HOME_SCREEN_MODAL_INSTRUCTIONS_I18N.string")}
                    </Text>
                </View>

                <View style={{ width: "100%", gap: 10 }}>
                    <Pressable
                        onPress={() => void dismiss()}
                        style={{
                            minHeight: 50,
                            borderRadius: 25,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: palette.purple,
                            paddingHorizontal: 18,
                        }}
                    >
                        <Text style={[ss.bodyFont, ss.whiteText]}>
                            {t("DISMISS_I18N.string")}
                        </Text>
                    </Pressable>
                </View>
            </Pressable>
        </Pressable>
    );
}

export function useIsWebAppStandalone(): boolean {
    const [standalone, setStandalone] = React.useState(isWebAppStandalone);

    React.useEffect(() => {
        setStandalone(isWebAppStandalone());
    }, []);

    return standalone;
}

export function useIsIOSWebDevice(): boolean {
    const [isIOS, setIsIOS] = React.useState(isIOSWebDevice);

    React.useEffect(() => {
        setIsIOS(isIOSWebDevice());
    }, []);

    return isIOS;
}

export function AddToHomeScreenSettingsIcon() {
    return <Icon name="home" color={palette.black} size={20} />;
}

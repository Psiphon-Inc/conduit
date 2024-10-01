import * as Haptics from "expo-haptics";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { Icon } from "@/src/components/Icon";
import { useInProxyContext } from "@/src/inproxy/context";
import { iconButton, palette, sharedStyles as ss } from "@/src/styles";

export function SendDiagnosticButton() {
    const { sendFeedback } = useInProxyContext();
    const { t } = useTranslation();

    const [showThankYou, setShowThankYou] = React.useState(false);

    if (showThankYou) {
        return (
            <View>
                <Text style={[ss.bodyFont, ss.whiteText]}>
                    {t("SENT_THANK_YOU_I18N.string")}
                </Text>
            </View>
        );
    } else {
        return (
            <Pressable
                style={iconButton}
                onPress={() => {
                    Haptics.selectionAsync();
                    sendFeedback();
                    setShowThankYou(true);
                    setTimeout(() => setShowThankYou(false), 5000);
                }}
            >
                <Icon name="send" size={34} color={palette.white} />
            </Pressable>
        );
    }
}

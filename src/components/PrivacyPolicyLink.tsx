import * as Linking from "expo-linking";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextStyle } from "react-native";

import { PRIVACY_POLICY_URL } from "@/src/constants";
import { sharedStyles as ss } from "@/src/styles";
import { Icon } from "./Icon";

export function PrivacyPolicyLink({
    containerHeight,
    textStyle,
}: {
    containerHeight: number;
    textStyle: TextStyle;
}) {
    const { t } = useTranslation();

    const style = {
        // some defaults
        ...ss.whiteText,
        ...ss.bodyFont,
        // override with prop
        ...textStyle,
    };

    return (
        <Pressable
            accessible={true}
            accessibilityLabel={"Link to privacy policy"}
            style={[
                ss.absolute,
                ss.row,
                ss.justifyCenter,
                ss.alignCenter,
                ss.fullWidth,
                { bottom: 0, height: containerHeight },
            ]}
            onPress={() => {
                Linking.openURL(PRIVACY_POLICY_URL);
            }}
        >
            <Text style={style}>{t("PRIVACY_POLICY_I18N.string")}</Text>
            <Icon
                name="external-link"
                size={style.fontSize * 1.5}
                color={style.color as string}
            />
        </Pressable>
    );
}

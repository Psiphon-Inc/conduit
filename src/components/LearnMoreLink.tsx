import * as Linking from "expo-linking";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextStyle } from "react-native";

import { LEARN_MORE_URL } from "@/src/constants";
import { sharedStyles as ss } from "@/src/styles";
import { Icon } from "./Icon";

export function LearnMoreLink({
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
            accessibilityLabel={"Link to information website"}
            style={[
                ss.absolute,
                ss.row,
                ss.justifyCenter,
                ss.alignCenter,
                ss.fullWidth,
                { bottom: 0, height: containerHeight },
            ]}
            onPress={() => {
                Linking.openURL(LEARN_MORE_URL);
            }}
        >
            <Text style={style}>{t("LEARN_MORE_I18N.string")}</Text>
            <Icon
                name="external-link"
                size={style.fontSize * 1.5}
                color={style.color as string}
            />
        </Pressable>
    );
}

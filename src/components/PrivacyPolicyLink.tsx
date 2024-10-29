/*
 * Copyright (c) 2024, Psiphon Inc.
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


import * as Linking from "expo-linking";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextStyle } from "react-native";

import { Icon } from "@/src/components/Icon";
import { PRIVACY_POLICY_URL } from "@/src/constants";
import { sharedStyles as ss } from "@/src/styles";

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

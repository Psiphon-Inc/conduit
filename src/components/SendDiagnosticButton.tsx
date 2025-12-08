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

import * as Haptics from "expo-haptics";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { Icon } from "@/src/components/Icon";
import { useInproxyContext } from "@/src/inproxy/context";
import { palette, sharedStyles as ss } from "@/src/styles";

export function SendDiagnosticButton() {
    const { sendFeedback } = useInproxyContext();
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
                style={{
                    backgroundColor: palette.black,
                    borderRadius: 5,
                }}
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

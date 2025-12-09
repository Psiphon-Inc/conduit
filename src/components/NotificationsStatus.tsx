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
import * as Notifications from "expo-notifications";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { useNotificationsPermissions } from "@/src/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

function RequestPermissionsPrompt({
    onPress,
}: {
    onPress: () => Promise<any>;
}) {
    const { t } = useTranslation();
    return (
        <View
            style={[
                ss.row,
                ss.justifySpaceBetween,
                ss.alignCenter,
                ss.fullWidth,
            ]}
        >
            <View style={[ss.row]}>
                <Text
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    style={[ss.bodyFont, ss.whiteText]}
                >
                    {t("NOTIFICATIONS_I18N.string")}
                </Text>
            </View>
            <Pressable
                onPress={onPress}
                style={[
                    ss.rounded5,
                    ss.halfPadded,
                    { backgroundColor: palette.white },
                ]}
            >
                <Text style={[ss.bodyFont, ss.blackText]}>
                    {t("ENABLE_I18N.string")}
                </Text>
            </Pressable>
        </View>
    );
}

function PermissionsGranted() {
    const { t } = useTranslation();

    return (
        <View style={[ss.row, ss.justifySpaceBetween, ss.fullWidth]}>
            <Text style={[ss.bodyFont, ss.whiteText]}>
                {t("NOTIFICATIONS_I18N.string")}
            </Text>
            <View style={[ss.row]}>
                <Text style={[ss.bodyFont, ss.whiteText]}>
                    {t("ENABLED_I18N.string")}
                </Text>
            </View>
        </View>
    );
}

export function NotificationsStatus() {
    const permissions = useNotificationsPermissions();

    if (permissions.data) {
        if (permissions.data === "NOT_GRANTED_CAN_ASK") {
            return (
                <RequestPermissionsPrompt
                    onPress={async () =>
                        await Notifications.requestPermissionsAsync()
                    }
                />
            );
        } else if (permissions.data === "NOT_GRANTED_CANT_ASK") {
            return (
                <RequestPermissionsPrompt
                    onPress={async () => await Linking.openSettings()}
                />
            );
        } else {
            return <PermissionsGranted />;
        }
    }
}

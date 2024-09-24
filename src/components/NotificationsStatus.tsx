import { MaterialIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

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
                <MaterialIcons
                    name="warning-amber"
                    color={palette.red}
                    size={20}
                />
            </View>
            <Pressable
                onPress={onPress}
                style={[
                    ss.padded,
                    ss.rounded40,
                    { backgroundColor: palette.redTint2 },
                ]}
            >
                <Text style={[ss.bodyFont, ss.whiteText]}>
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
                <MaterialIcons name="check" color={palette.white} size={20} />
            </View>
        </View>
    );
}

export function NotificationsStatus() {
    const permissions = useQuery({
        queryKey: ["sync-notifications-permissions"],
        queryFn: async () => {
            return await Notifications.getPermissionsAsync();
        },
        refetchInterval: 2000,
    });

    if (permissions.data) {
        if (
            permissions.data.status !== "granted" &&
            permissions.data.canAskAgain
        ) {
            return (
                <RequestPermissionsPrompt
                    onPress={async () =>
                        await Notifications.requestPermissionsAsync()
                    }
                />
            );
        } else if (
            permissions.data.status !== "granted" &&
            !permissions.data.canAskAgain
        ) {
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

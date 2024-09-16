import * as Notifications from "expo-notifications";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAccountContext } from "@/src/account/context";
import { NotificationsStatus } from "@/src/components/NotificationsStatus";
import { ProxyID } from "@/src/components/ProxyID";
import { getProxyId } from "@/src/psiphon/inproxy";
import { palette, sharedStyles as ss } from "@/src/styles";

export default function HomeScreen() {
    const insets = useSafeAreaInsets();
    const { conduitKeyPair } = useAccountContext();
    const { t } = useTranslation();

    const [message, setMessage] = React.useState("Conduit is OFF");

    return (
        <View
            style={[
                ss.flex,
                ss.column,
                {
                    marginTop: insets.top,
                    marginBottom: insets.bottom,
                    marginLeft: insets.left,
                    marginRight: insets.right,
                },
            ]}
        >
            <View style={[ss.flex, ss.padded]}>
                <Text style={[ss.whiteText, ss.extraLargeFont]}>
                    {">"} Conduit
                </Text>
            </View>
            <View
                style={[ss.flex, ss.column, ss.justifyCenter, ss.alignCenter]}
            >
                <Pressable
                    style={({ pressed }) => [
                        ss.justifyCenter,
                        ss.alignCenter,
                        ss.whiteBorder,
                        ss.circle158,
                        {
                            backgroundColor: pressed
                                ? palette.blue
                                : palette.grey,
                        },
                    ]}
                    onPress={async () => {
                        await Notifications.requestPermissionsAsync();
                        setMessage("Conduit is not implemented yet!");
                        setTimeout(
                            () => setMessage(t("CONDUIT_OFF_I18N.string")),
                            5000,
                        );
                    }}
                >
                    <Text style={[ss.whiteText, ss.boldFont]}>
                        {t("TURN_ON_I18N.string")}
                    </Text>
                </Pressable>
                <Text style={[ss.whiteText, ss.bodyFont]}>{message}</Text>
                <NotificationsStatus />
            </View>
            <View style={[ss.flex, ss.row, ss.justifyCenter, ss.alignCenter]}>
                <Text style={[ss.whiteText, ss.bodyFont]}>
                    {t("YOUR_ID_I18N.string")}{" "}
                </Text>
                <ProxyID proxyId={getProxyId(conduitKeyPair)} />
            </View>
        </View>
    );
}

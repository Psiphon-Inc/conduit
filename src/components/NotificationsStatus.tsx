import { MaterialIcons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import React from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { useNotificationsContext } from "@/src/notifications/context";
import { palette, sharedStyles as ss } from "@/src/styles";

export function NotificationsStatus() {
    const {
        permissionStatus,
        canAskAgain,
        warningDismissed,
        useDismissNotificationsWarning,
    } = useNotificationsContext();
    const dismissNotificationsWarning = useDismissNotificationsWarning();

    const [modalOpen, setModalOpen] = React.useState<boolean>(false);

    if (permissionStatus !== "granted") {
        if (canAskAgain === false && warningDismissed === false) {
            return (
                <>
                    <Pressable
                        onPress={() => setModalOpen(true)}
                        style={[ss.row, ss.justifyCenter, ss.alignCenter]}
                    >
                        <Text
                            adjustsFontSizeToFit
                            numberOfLines={1}
                            style={[ss.bodyFont, ss.whiteText]}
                        >
                            Notifications OFF
                        </Text>
                        <MaterialIcons
                            name="warning-amber"
                            color={palette.red}
                            size={20}
                        />
                    </Pressable>
                    <Modal
                        animationType="slide"
                        transparent={true}
                        visible={modalOpen}
                        onRequestClose={() => setModalOpen(false)}
                    >
                        <View style={[ss.underlay]} />
                        <View
                            style={[
                                ss.modalCenter,
                                ss.doublePadded,
                                ss.justifySpaceAround,
                            ]}
                        >
                            <Text
                                style={[
                                    ss.bodyFont,
                                    ss.whiteText,
                                    ss.centeredText,
                                ]}
                            >
                                We recommend enabling notifications
                            </Text>
                            <Text
                                style={[
                                    ss.boldFont,
                                    ss.whiteText,
                                    ss.centeredText,
                                ]}
                            >
                                Notifications must be enabled in settings
                            </Text>
                            <View style={[ss.column, ss.justifySpaceBetween]}>
                                <Pressable
                                    onPress={() => {
                                        dismissNotificationsWarning.mutate();
                                    }}
                                    style={({ pressed }) => [
                                        {
                                            backgroundColor: pressed
                                                ? "rgba(0, 0, 0, 0.2)"
                                                : "",
                                        },
                                        ss.alignCenter,
                                        ss.justifyCenter,
                                        ss.doublePadded,
                                        ss.whiteBorder,
                                        ss.rounded20,
                                    ]}
                                >
                                    <Text style={[ss.boldFont, ss.whiteText]}>
                                        Dismiss
                                    </Text>
                                </Pressable>
                                <Pressable
                                    onPress={() => {
                                        Linking.openSettings();
                                        setModalOpen(false);
                                    }}
                                    style={[
                                        ss.alignCenter,
                                        ss.justifyCenter,
                                        ss.doublePadded,
                                        ss.rounded20,
                                        {
                                            backgroundColor: palette.purple,
                                        },
                                    ]}
                                >
                                    <Text style={[ss.boldFont, ss.whiteText]}>
                                        Go To Settings
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    </Modal>
                </>
            );
        }
    }
}

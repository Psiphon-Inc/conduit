import React from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, useWindowDimensions, View } from "react-native";

import { Icon } from "@/src/components/Icon";
import { useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { useInproxyStatus } from "../inproxy/hooks";
import { palette, sharedStyles as ss } from "../styles";
import { InproxyStatusColorCanvas } from "./SkyBox";

export function ConduitAnalytics() {
    const win = useWindowDimensions();
    const { t } = useTranslation();

    const [modalOpen, setModalOpen] = React.useState(false);

    const { data: inproxyStatus } = useInproxyStatus();

    // fadeIn on first load
    const fadeIn = useSharedValue(0);
    React.useEffect(() => {
        if (inproxyStatus !== "UNKNOWN") {
            fadeIn.value = withDelay(0, withTiming(0.8, { duration: 2000 }));
        }
    }, [inproxyStatus]);

    return (
        <>
            <View
                style={[
                    {
                        padding: 7,
                        bottom: 0,
                        right: 0,
                    },
                ]}
            >
                <Pressable
                    accessible={true}
                    accessibilityLabel={t("ANALYTICS_I18N.string")}
                    accessibilityRole={"button"}
                    onPress={() => {
                        setModalOpen(true);
                    }}
                    style={{
                        justifyContent: "center",
                        alignItems: "center",
                        height: "100%",
                    }}
                >
                    <Icon
                        name="analytics"
                        size={30}
                        color={palette.black}
                        opacity={fadeIn}
                        label={t("ANALYTICS_I18N.string")}
                    />
                </Pressable>
            </View>
            <Modal
                animationType="fade"
                visible={modalOpen}
                transparent={true}
                onRequestClose={() => setModalOpen(false)}
            >
                <View style={[ss.underlay]} />
                <View style={[ss.modalBottom90, { overflow: "hidden" }]}>
                    <InproxyStatusColorCanvas
                        width={win.width}
                        height={win.height * 0.9}
                    />
                </View>
                <View style={[ss.modalBottom90]}></View>
            </Modal>
        </>
    );
}

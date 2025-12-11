/*
 * Copyright (c) 2025, Psiphon Inc.
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
import React from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, View, useWindowDimensions } from "react-native";
import { useSharedValue, withDelay, withTiming } from "react-native-reanimated";

import { Icon } from "@/src/components/Icon";
import { InproxyStatusColorCanvas } from "@/src/components/SkyBox";
import { useInproxyStatus } from "@/src/inproxy/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

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

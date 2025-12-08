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

import {
    Canvas,
    Group,
    Paragraph,
    SkParagraphStyle,
    SkTextStyle,
    Skia,
    TextAlign,
    TextDirection,
    useFonts,
} from "@shopify/react-native-skia";
import React from "react";
import { useTranslation } from "react-i18next";
import { View, useWindowDimensions } from "react-native";
import {
    useDerivedValue,
    useSharedValue,
    withDelay,
    withTiming,
} from "react-native-reanimated";

import { drawBigFont, niceBytes } from "@/src/common/utils";
import { FaderGroup } from "@/src/components/canvas/FaderGroup";
import { useConduitName } from "@/src/hooks";
import { useInproxyContext } from "@/src/inproxy/context";
import {
    useInproxyCurrentConnectedClients,
    useInproxyCurrentConnectingClients,
    useInproxyStatus,
    useInproxyTotalBytesTransferred,
} from "@/src/inproxy/hooks";
import { fonts, palette, sharedStyles as ss } from "@/src/styles";

export function ConduitStatus({
    width,
    height,
}: {
    width: number;
    height: number;
}) {
    const { t, i18n } = useTranslation();
    const isRTL = i18n.dir() === "rtl" ? true : false;
    const win = useWindowDimensions();

    const { logErrorToDiagnostic } = useInproxyContext();
    const { data: inproxyStatus } = useInproxyStatus();
    const { data: connectedPeers } = useInproxyCurrentConnectedClients();
    const { data: connectingPeers } = useInproxyCurrentConnectingClients();
    const { data: totalBytesTransferred } = useInproxyTotalBytesTransferred();
    const { data: conduitName } = useConduitName();

    // use conduitName if user has set it
    let conduitStationText: string;
    if (conduitName) {
        conduitStationText = conduitName;
    } else {
        conduitStationText = t("CONDUIT_STATION_I18N.string");
    }
    const proxyStatusText = t(`${inproxyStatus}_I18N.string`);
    const connectedPeersText = t("CONNECTED_PEERS_I18N.string", {
        peers: connectedPeers,
    });
    const connectingPeersText =
        " + " +
        t("CONNECTING_PEERS_I18N.string", {
            peers: connectingPeers,
        });
    const totalBytesTransferredText = t("TOTAL_BYTES_TRANSFERRED_I18N.string", {
        niceBytes: niceBytes(totalBytesTransferred, logErrorToDiagnostic),
    });
    const waitingForPeersText = t("WAITING_FOR_PEERS_I18N.string");

    // Fade in gradient on app start
    const fadeIn = useSharedValue(0);
    // Fade in status text when conduit is running
    const fader = useSharedValue(0);
    const shouldAnimateIn = React.useRef(true);
    const shouldAnimateOut = React.useRef(true);

    React.useEffect(() => {
        if (inproxyStatus !== "UNKNOWN") {
            fadeIn.value = withDelay(0, withTiming(1, { duration: 2000 }));
        }
        if (inproxyStatus === "RUNNING") {
            if (shouldAnimateIn.current) {
                fader.value = withTiming(1, { duration: 1000 });
                shouldAnimateIn.current = false;
                shouldAnimateOut.current = true;
            }
        } else if (inproxyStatus === "STOPPED") {
            if (shouldAnimateOut.current) {
                fader.value = withTiming(0, { duration: 1000 });
                shouldAnimateIn.current = true;
                shouldAnimateOut.current = false;
            }
        }
    }, [inproxyStatus]);

    const fontMgr = useFonts({ Jura: [fonts.JuraRegular] });
    const fontSize = drawBigFont(win) ? 20 : 16;
    const statusParagraph = useDerivedValue(() => {
        if (!fontMgr) {
            return null;
        }
        let paragraphStyle: SkParagraphStyle = {
            textAlign: TextAlign.Center,
        };
        if (isRTL) {
            paragraphStyle.textDirection = TextDirection.RTL;
        }
        const mainTextStyle: SkTextStyle = {
            color: Skia.Color(palette.black),
            fontFamilies: ["Jura"],
            fontSize: fontSize,
            fontStyle: {
                weight: 300,
            },
            letterSpacing: 1, // 5% of 20
        };
        const runningTextStyle: SkTextStyle = {
            color: Skia.Color(palette.black),
            fontFamilies: ["Jura"],
            fontSize: fontSize,
            fontStyle: {
                weight: 300,
            },
            letterSpacing: 1, // 5% of 20
        };
        const waitingTextStyle: SkTextStyle = {
            color: Skia.Color(palette.grey),
            fontFamilies: ["Jura"],
            fontSize: fontSize,
            fontStyle: {
                weight: 300,
            },
            letterSpacing: 1, // 5% of 20
        };

        return Skia.ParagraphBuilder.Make(paragraphStyle, fontMgr)
            .pushStyle(mainTextStyle)
            .addText(conduitStationText + " ")
            .pushStyle(runningTextStyle)
            .addText(proxyStatusText + "\n")
            .pop()
            .pushStyle(waitingTextStyle)
            .addText(connectedPeers === 0 ? waitingForPeersText + "\n" : "\n")
            .pop()
            .addText(connectedPeersText + "\n")
            .addText(connectingPeersText + "\n")
            .addText(totalBytesTransferredText + "\n")
            .build();
    });

    return (
        <View
            style={[
                {
                    width: width,
                    height: height,
                },
            ]}
        >
            <Canvas style={[ss.flex]}>
                <FaderGroup opacity={fader}>
                    <Group>
                        <Paragraph
                            paragraph={statusParagraph}
                            x={0}
                            y={0}
                            width={width}
                        />
                    </Group>
                </FaderGroup>
            </Canvas>
        </View>
    );
}

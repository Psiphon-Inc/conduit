import {
    Canvas,
    ColorMatrix,
    Group,
    LinearGradient,
    Paint,
    Paragraph,
    Rect,
    Skia,
    TextAlign,
    interpolateColors,
    useFonts,
    vec,
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
import { PARTICLE_VIDEO_DELAY_MS } from "@/src/constants";
import { useInProxyContext } from "@/src/inproxy/context";
import {
    useInProxyCurrentConnectedClients,
    useInProxyCurrentConnectingClients,
    useInProxyStatus,
    useInProxyTotalBytesTransferred,
} from "@/src/inproxy/hooks";
import { fonts, palette, sharedStyles as ss } from "@/src/styles";

export function ConduitStatus({
    width,
    height,
}: {
    width: number;
    height: number;
}) {
    const { t } = useTranslation();
    const win = useWindowDimensions();

    const { logErrorToDiagnostic } = useInProxyContext();
    const { data: inProxyStatus } = useInProxyStatus();
    const { data: connectedPeers } = useInProxyCurrentConnectedClients();
    const { data: connectingPeers } = useInProxyCurrentConnectingClients();
    const { data: totalBytesTransferred } = useInProxyTotalBytesTransferred();

    const conduitStationText = t("CONDUIT_STATION_I18N.string");
    const proxyStatusText = t(`${inProxyStatus}_I18N.string`);
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
    if (inProxyStatus !== "UNKNOWN") {
        fadeIn.value = withDelay(
            inProxyStatus === "STOPPED" ? PARTICLE_VIDEO_DELAY_MS : 0,
            withTiming(1, { duration: 2000 }),
        );
    }

    // Fade in status text when conduit is running
    const fader = useSharedValue(0);
    const shouldAnimateIn = React.useRef(true);
    const shouldAnimateOut = React.useRef(true);
    if (inProxyStatus === "RUNNING") {
        if (shouldAnimateIn.current) {
            fader.value = withTiming(1, { duration: 1000 });
            shouldAnimateIn.current = false;
            shouldAnimateOut.current = true;
        }
    } else if (inProxyStatus === "STOPPED") {
        if (shouldAnimateOut.current) {
            fader.value = withTiming(0, { duration: 1000 });
            shouldAnimateIn.current = true;
            shouldAnimateOut.current = false;
        }
    }
    // make gradient taller with fader
    const gradientPairs = [
        [palette.black, palette.purpleShade5],
        [palette.black, palette.purpleShade4],
        [palette.purpleShade5, palette.purpleShade3],
        [palette.purpleShade4, palette.purpleShade2],
        [palette.purpleShade3, palette.purpleShade1],
        [palette.redShade4, palette.redShade2],
    ];
    const backgroundGradientColors = useDerivedValue(() => {
        return [
            palette.black,
            interpolateColors(fader.value, [0, 1], gradientPairs[0]),
            interpolateColors(fader.value, [0, 1], gradientPairs[1]),
            interpolateColors(fader.value, [0, 1], gradientPairs[2]),
            interpolateColors(fader.value, [0, 1], gradientPairs[3]),
            interpolateColors(fader.value, [0, 1], gradientPairs[4]),
            interpolateColors(fader.value, [0, 1], gradientPairs[5]),
        ];
    });
    // implicit do nothing if inProxyStatus is "unknown"

    const fontMgr = useFonts({ Jura: [fonts.JuraRegular] });
    const fontSize = drawBigFont(win) ? 20 : 16;
    const statusParagraph = useDerivedValue(() => {
        if (!fontMgr) {
            return null;
        }
        const paragraphStyle = {
            textAlign: TextAlign.Center,
        };
        const mainTextStyle = {
            color: Skia.Color(palette.statusTextBlue),
            fontFamilies: ["Jura"],
            fontSize: fontSize,
            fontStyle: {
                weight: 300,
            },
            letterSpacing: 1, // 5% of 20
        };
        const runningTextStyle = {
            color: Skia.Color(palette.red),
            fontFamilies: ["Jura"],
            fontSize: fontSize,
            fontStyle: {
                weight: 300,
            },
            letterSpacing: 1, // 5% of 20
        };

        const waitingTextStyle = {
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

    // Text is painted differently by Skia, so we use this opacity matrix to
    // fade it in and out.
    const opacityMatrix = useDerivedValue(() => {
        // prettier-ignore
        return [
         // R, G, B, A, Bias
            1, 0, 0, 0, 0,
            0, 1, 0, 0, 0,
            0, 0, 1, 0, 0,
            0, 0, 0, fader.value, 0,
        ];
    });

    return (
        <View
            style={[
                {
                    position: "absolute",
                    bottom: 0,
                    width: width,
                    height: height,
                },
            ]}
        >
            <Canvas style={[ss.flex]}>
                <Rect
                    x={0}
                    y={0}
                    width={width}
                    height={height}
                    opacity={fadeIn}
                >
                    <LinearGradient
                        start={vec(width / 2, 0)}
                        end={vec(width / 2, height)}
                        colors={backgroundGradientColors}
                    />
                </Rect>
                <Group
                    layer={
                        <Paint>
                            <ColorMatrix matrix={opacityMatrix} />
                        </Paint>
                    }
                >
                    <Paragraph
                        paragraph={statusParagraph}
                        x={0}
                        y={0}
                        width={width}
                    />
                </Group>
            </Canvas>
        </View>
    );
}

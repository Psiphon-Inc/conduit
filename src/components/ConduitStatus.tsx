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
    useFonts,
    vec,
} from "@shopify/react-native-skia";
import React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import {
    useDerivedValue,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";

import { niceBytes } from "@/src/common/utils";
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

    const { data: inProxyStatus } = useInProxyStatus();
    const { data: connectedPeers } = useInProxyCurrentConnectedClients();
    const { data: connectingPeers } = useInProxyCurrentConnectingClients();
    const { data: totalBytesTransferred } = useInProxyTotalBytesTransferred();

    // Fade in when conduit is running
    const fader = useSharedValue(0);
    const shouldAnimateIn = React.useRef(true);
    const shouldAnimateOut = React.useRef(true);
    React.useEffect(() => {
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
        // implicit do nothing if inProxyStatus is "unknown"
    }, [inProxyStatus]);

    const fontMgr = useFonts({ Jura: [fonts.JuraRegular] });
    const statusParagraph = React.useMemo(() => {
        if (!fontMgr) {
            return null;
        }
        const paragraphStyle = {
            textAlign: TextAlign.Center,
        };
        const textStyle = {
            color: Skia.Color(palette.statusTextBlue),
            fontFamilies: ["Jura"],
            fontSize: 20,
            fontStyle: {
                weight: 300,
            },
            letterSpacing: 1, // 5% of 20
        };

        const proxyStatusText = t("PROXY_STATUS_I18N.string", {
            status: t(`${inProxyStatus}_I18N.string`),
        });
        const connectedPeersText = t("CONNECTED_PEERS_I18N.string", {
            peers: connectedPeers,
        });
        const connectingPeersText =
            " + " +
            t("CONNECTING_PEERS_I18N.string", {
                peers: connectingPeers,
            });
        const totalBytesTransferredText = t(
            "TOTAL_BYTES_TRANSFERRED_I18N.string",
            {
                niceBytes: niceBytes(totalBytesTransferred),
            },
        );

        return Skia.ParagraphBuilder.Make(paragraphStyle, fontMgr)
            .pushStyle(textStyle)
            .addText(proxyStatusText + "\n")
            .addText(connectedPeersText + "\n")
            .addText(connectingPeersText + "\n")
            .addText(totalBytesTransferredText + "\n")
            .build();
    }, [inProxyStatus, connectedPeers, connectingPeers, totalBytesTransferred]);

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
                <Rect x={0} y={0} width={width} height={height} opacity={fader}>
                    <LinearGradient
                        start={vec(width / 2, 0)}
                        end={vec(width / 2, height)}
                        colors={[
                            palette.black,
                            palette.purpleShade5,
                            palette.purpleShade4,
                            palette.purpleShade3,
                            palette.purpleShade2,
                            palette.purpleShade1,
                            palette.redShade2,
                        ]}
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

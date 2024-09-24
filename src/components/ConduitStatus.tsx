import {
    Canvas,
    ColorShader,
    Group,
    LinearGradient,
    Rect,
    Text,
    useFont,
    vec,
} from "@shopify/react-native-skia";
import React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSharedValue, withTiming } from "react-native-reanimated";

import { niceBytes } from "@/src/common/utils";
import {
    useInProxyCurrentConnectedClients,
    useInProxyCurrentConnectingClients,
    useInProxyStatus,
    useInProxyTotalBytesTransferred,
} from "@/src/inproxy/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

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

    const connectedPeersText = t("CONNECTED_PEERS_I18N.string", {
        peers: connectedPeers,
    });
    const connectingPeersText =
        " + " +
        t("CONNECTING_PEERS_I18N.string", {
            peers: connectingPeers,
        });
    const totalBytesTransferredText = t("TOTAL_BYTES_TRANSFERRED_I18N.string", {
        niceBytes: niceBytes(totalBytesTransferred),
    });

    // will fade in when conduit is running
    const fader = useSharedValue(0);
    const [shouldAnimateIn, setShouldAnimateIn] = React.useState(true);
    const [shouldAnimateOut, setShouldAnimateOut] = React.useState(true);
    React.useEffect(() => {
        if (inProxyStatus === "RUNNING") {
            if (shouldAnimateIn) {
                fader.value = withTiming(1, { duration: 1000 });
                setShouldAnimateIn(false);
                setShouldAnimateOut(true);
            }
        } else if (inProxyStatus === "STOPPED") {
            if (shouldAnimateOut) {
                fader.value = withTiming(0, { duration: 1000 });
                setShouldAnimateIn(true);
                setShouldAnimateOut(false);
            }
        }
        // implicit do nothing if inProxyStatus is "unknown"
    }, [inProxyStatus]);

    const font = useFont(require("@/assets/fonts/SpaceMono-Regular.ttf"), 20);
    if (!font) {
        return null;
    }

    // prepare Y offsets
    const padY = width * 0.05;
    const connectedPeersTextOffsetY =
        font.measureText(connectedPeersText).height;
    const connectingPeersTextOffsetY =
        font.measureText(connectingPeersText).height +
        connectedPeersTextOffsetY +
        padY;
    const totalBytesTransferredTextOffsetY =
        font.measureText(totalBytesTransferredText).height +
        connectingPeersTextOffsetY +
        padY;

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
                        colors={[palette.black, palette.purpleShade2]}
                    />
                </Rect>
                <Group opacity={fader}>
                    <Text
                        x={width * 0.05}
                        y={connectedPeersTextOffsetY}
                        text={connectedPeersText}
                        font={font}
                    >
                        <ColorShader color={palette.purpleTint4} />
                    </Text>
                    <Text
                        x={width * 0.05}
                        y={connectingPeersTextOffsetY}
                        text={connectingPeersText}
                        font={font}
                    >
                        <ColorShader
                            color={
                                connectingPeers > 0
                                    ? palette.purpleTint4
                                    : palette.grey
                            }
                        />
                    </Text>
                    <Text
                        x={width * 0.05}
                        y={totalBytesTransferredTextOffsetY}
                        text={totalBytesTransferredText}
                        font={font}
                    >
                        <ColorShader color={palette.purpleTint4} />
                    </Text>
                </Group>
            </Canvas>
        </View>
    );
}

import {
    Canvas,
    ColorShader,
    Group,
    LinearGradient,
    Path,
    Rect,
    Text,
    useFont,
    vec,
} from "@shopify/react-native-skia";
import React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSharedValue, withDelay, withTiming } from "react-native-reanimated";

import { pathFromPoints } from "@/src/common/skia";
import { niceBytes } from "@/src/common/utils";
import {
    useInProxyActivityContext,
    useInProxyContext,
} from "@/src/psiphon/mockContext";
import { palette, sharedStyles as ss } from "@/src/styles";

export function ConduitStatus({
    width,
    height,
}: {
    width: number;
    height: number;
}) {
    const { t } = useTranslation();
    const {
        inProxyActivityBy1000ms,
        inProxyCurrentConnectedClients,
        inProxyTotalBytesTransferred,
    } = useInProxyActivityContext();
    const { getInProxyStatus } = useInProxyContext();

    const connectedPeersText = t("CONNECTED_PEERS_I18N.string", {
        peers: inProxyCurrentConnectedClients,
    });
    const totalBytesTransferredText = t("TOTAL_BYTES_TRANSFERRED_I18N.string", {
        niceBytes: niceBytes(inProxyTotalBytesTransferred),
    });

    // fade in gradient on initial render
    const fadeInGradient = useSharedValue(0);
    React.useEffect(() => {
        const inProxyStatus = getInProxyStatus();
        if (inProxyStatus.status === "running") {
            fadeInGradient.value = withTiming(1, { duration: 2000 });
        } else if (inProxyStatus.status === "stopped") {
            fadeInGradient.value = withDelay(
                2800,
                withTiming(1, { duration: 2000 }),
            );
        }
        // implicitly do nothing on status unknown
    }, [getInProxyStatus]);

    // will fade in text when conduit is running
    const fader = useSharedValue(0);
    const [shouldAnimateIn, setShouldAnimateIn] = React.useState(true);
    const [shouldAnimateOut, setShouldAnimateOut] = React.useState(true);
    React.useEffect(() => {
        const inProxyStatus = getInProxyStatus().status;
        if (inProxyStatus === "running") {
            if (shouldAnimateIn) {
                fader.value = withTiming(1, { duration: 1000 });
                setShouldAnimateIn(false);
                setShouldAnimateOut(true);
            }
        } else if (inProxyStatus === "stopped") {
            if (shouldAnimateOut) {
                fader.value = withTiming(0, { duration: 1000 });
                setShouldAnimateIn(true);
                setShouldAnimateOut(false);
            }
        }
        // implicit do nothing if inProxyStatus is "unknown"
    }, [getInProxyStatus]);

    const font = useFont(require("@/assets/fonts/SpaceMono-Regular.ttf"), 20);
    if (!font) {
        return null;
    }

    // prepare graph data if we have any
    const globalMax = Math.max(
        ...inProxyActivityBy1000ms.bytesUp,
        ...inProxyActivityBy1000ms.bytesDown,
        0,
    );

    const bytesReceivedPath = pathFromPoints(
        inProxyActivityBy1000ms.bytesDown,
        height * 0.1,
        globalMax,
    );
    const bytesSentPath = pathFromPoints(
        inProxyActivityBy1000ms.bytesUp,
        height * 0.1,
        globalMax,
    );

    // prepare Y offsets
    const padY = width * 0.05;
    const connectedPeersTextOffsetY =
        font.measureText(connectedPeersText).height;
    const totalBytesTransferredTextOffsetY =
        font.measureText(totalBytesTransferredText).height +
        connectedPeersTextOffsetY +
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
                <Rect
                    x={0}
                    y={0}
                    width={width}
                    height={height}
                    opacity={fadeInGradient}
                >
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
                        <ColorShader color={palette.blue} />
                    </Text>
                    <Text
                        x={width * 0.05}
                        y={totalBytesTransferredTextOffsetY}
                        text={totalBytesTransferredText}
                        font={font}
                    >
                        <ColorShader color={palette.blue} />
                    </Text>
                    <Group
                        transform={[
                            {
                                translateY: height * 0.9 + 4,
                            },
                            {
                                translateX: (width - 288) / 2,
                            },
                        ]}
                    >
                        <Path
                            path={bytesReceivedPath}
                            color={palette.transparentBlue}
                            style="fill"
                            strokeWidth={2}
                            strokeJoin={"round"}
                        />
                        <Path
                            path={bytesSentPath}
                            color={palette.transparentPurple}
                            style="fill"
                            strokeWidth={2}
                            strokeJoin={"round"}
                        />
                    </Group>
                </Group>
            </Canvas>
        </View>
    );
}

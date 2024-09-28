import React from "react";
import { View } from "react-native";
import Animated, {
    useSharedValue,
    withDelay,
    withTiming,
} from "react-native-reanimated";

// @ts-ignore (this file is gitignored)
import { PARTICLE_VIDEO_DELAY_MS } from "@/src/constants";
import { GIT_HASH } from "@/src/git-hash";
import { useInProxyStatus } from "@/src/inproxy/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

export function GitHash() {
    const { data: inProxyStatus } = useInProxyStatus();

    const opacity = useSharedValue(0);
    if (inProxyStatus !== "UNKNOWN") {
        opacity.value = withDelay(
            inProxyStatus === "STOPPED" ? PARTICLE_VIDEO_DELAY_MS : 0,
            withTiming(0.8, { duration: 2000 }),
        );
    }

    return (
        <View style={[ss.absoluteBottomLeft]}>
            <Animated.Text
                style={[
                    { color: palette.purple, opacity: opacity },
                    ss.bodyFont,
                ]}
            >
                v.{GIT_HASH}
            </Animated.Text>
        </View>
    );
}

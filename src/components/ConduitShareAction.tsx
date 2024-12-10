import { View } from "react-native";

import { SharePairingLink } from "@/src/components/SharePairingLink";
import { sharedStyles as ss } from "@/src/styles";
import Animated, { useSharedValue, withTiming } from "react-native-reanimated";
import { useInproxyContext } from "../inproxy/context";
import { useInproxyStatus } from "../inproxy/hooks";

export function ConduitShareAction({ height }: { height: number }) {
    const { inproxyParameters } = useInproxyContext();
    const { data: inproxyStatus } = useInproxyStatus();

    const opacity = useSharedValue(0);
    if (
        inproxyStatus === "RUNNING" &&
        inproxyParameters.personalPairingEnabled
    ) {
        opacity.value = withTiming(1, { duration: 2000 });
    } else {
        opacity.value = withTiming(0, { duration: 1000 });
    }

    const enabled = useSharedValue(true);

    return (
        <View
            style={[
                ss.absolute,
                ss.row,
                ss.fullWidth,
                ss.justifyCenter,
                ss.alignCenter,
                {
                    bottom: 0,
                    height: height,
                },
            ]}
        >
            <Animated.View
                style={{
                    opacity: opacity,
                }}
            >
                <SharePairingLink enabled={enabled} />
            </Animated.View>
        </View>
    );
}

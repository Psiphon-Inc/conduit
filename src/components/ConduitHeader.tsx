import { Text, View } from "react-native";

import { ConduitFlowerIcon } from "@/src/components/svgs/ConduitFlowerIcon";
import { ConduitWordmark } from "@/src/components/svgs/ConduitWordmark";
import { palette, sharedStyles as ss } from "@/src/styles";
// @ts-ignore
import { GIT_HASH } from "@/src/git-hash";

export function ConduitHeader({
    width,
    height,
}: {
    width: number;
    height: number;
}) {
    return (
        <View
            style={[
                {
                    width: width,
                    height: height,
                },
            ]}
        >
            <View style={[ss.row, ss.justifySpaceBetween]}>
                <View style={[ss.padded, ss.row, ss.alignCenter]}>
                    <ConduitFlowerIcon size={50} color={palette.white} />
                    <ConduitWordmark size={140} color={palette.white} />
                </View>
                <View
                    style={[
                        ss.justifyCenter,
                        ss.alignCenter,
                        ss.paddedRight,
                        { maxWidth: "30%" },
                    ]}
                >
                    <Text
                        adjustsFontSizeToFit
                        numberOfLines={1}
                        style={[ss.greyText, ss.bodyFont]}
                    >
                        v.{GIT_HASH}
                    </Text>
                </View>
            </View>
        </View>
    );
}

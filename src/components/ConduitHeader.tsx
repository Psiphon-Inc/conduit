import { View } from "react-native";

import { palette, sharedStyles as ss } from "@/src/styles";
import { ConduitFlowerIcon } from "./svgs/ConduitFlowerIcon";
import { ConduitWordmark } from "./svgs/ConduitWordmark";

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
            <View style={[ss.padded, ss.row, ss.alignCenter]}>
                <ConduitFlowerIcon size={50} color={palette.white} />
                <ConduitWordmark size={140} color={palette.white} />
            </View>
        </View>
    );
}

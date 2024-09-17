import React from "react";
import { View } from "react-native";

import { ConduitToggle } from "@/src/components/ConduitToggle";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { ConduitFlowerIcon } from "@/src/components/svgs/ConduitFlowerIcon";
import { ConduitWordmark } from "@/src/components/svgs/ConduitWordmark";
import { palette, sharedStyles as ss } from "@/src/styles";

export default function HomeScreen() {
    return (
        <SafeAreaView>
            <View style={[ss.padded, ss.row, ss.alignCenter]}>
                <ConduitFlowerIcon size={50} color={palette.white} />
                <ConduitWordmark size={140} color={palette.white} />
            </View>
            <View
                style={[ss.flex, ss.column, ss.justifyCenter, ss.alignCenter]}
            >
                <View style={[ss.flex, ss.alignCenter, ss.justifyCenter]}>
                    <ConduitToggle size={200} />
                </View>
                <View style={[ss.flex]}></View>
            </View>
        </SafeAreaView>
    );
}

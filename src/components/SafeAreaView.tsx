import { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette } from "@/src/styles";

export function SafeAreaView({ children }: { children: ReactNode }) {
    const insets = useSafeAreaInsets();

    return (
        <View
            style={{
                marginTop: insets.top,
                marginBottom: insets.bottom,
                marginLeft: insets.left,
                marginRight: insets.right,
                flex: 1,
                backgroundColor: palette.black,
            }}
        >
            {children}
        </View>
    );
}

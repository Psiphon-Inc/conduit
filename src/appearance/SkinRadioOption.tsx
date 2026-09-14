import { Pressable, Text } from "react-native";

import {
    useAppAppearance,
    useAppearanceStyles,
} from "@/src/appearance/AppAppearance";
import type { AppSkinId } from "@/src/appearance/appSkins";

/** Native screen-reader radio option; selection applies to the entire row. */
export function SkinRadioOption({
    id,
    label,
}: {
    id: AppSkinId;
    label: string;
}) {
    const { skin, selectSkin } = useAppAppearance();
    const ss = useAppearanceStyles();
    const checked = skin.id === id;
    return (
        <Pressable
            testID={`skin-${id}`}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            accessibilityLabel={label}
            onPress={() => selectSkin(id)}
            style={{
                minHeight: 48,
                padding: 12,
                borderWidth: 1,
                borderRadius: 12,
                borderColor: skin.border,
                backgroundColor: checked
                    ? skin.selectedBackground
                    : "transparent",
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
            }}
        >
            <Text accessible={false} style={{ color: skin.accent }}>
                {checked ? "◉" : "○"}
            </Text>
            <Text style={[ss.bodyFont, ss.blackText]}>{label}</Text>
        </Pressable>
    );
}

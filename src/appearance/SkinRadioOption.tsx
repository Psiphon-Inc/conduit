import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
    AccessibilityInfo,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

import {
    useAppAppearance,
    useAppearanceStyles,
} from "@/src/appearance/AppAppearance";
import { APP_SKINS, type AppSkinId } from "@/src/appearance/appSkins";

/** Native screen-reader radio option; selection applies to the entire row. */
export function SkinRadioOption({
    id,
    label,
    onSelect,
    focusOnMount = false,
}: {
    id: AppSkinId;
    label: string;
    onSelect: (id: AppSkinId) => void;
    focusOnMount?: boolean;
}) {
    const { skin } = useAppAppearance();
    const option = React.useRef<View>(null);
    const ss = useAppearanceStyles();
    const checked = skin.id === id;
    const optionSkin = APP_SKINS[id];
    return (
        <Pressable
            ref={option}
            onLayout={() => {
                if (focusOnMount && checked && option.current)
                    AccessibilityInfo.sendAccessibilityEvent(
                        option.current,
                        "focus",
                    );
            }}
            testID={`skin-${id}`}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            accessibilityLabel={label}
            onPress={() => onSelect(id)}
            style={{
                minHeight: 48,
                padding: 12,
                borderRadius: 8,
                overflow: "hidden",
                borderWidth: 2,
                borderColor: checked ? optionSkin.accent : optionSkin.border,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
            }}
        >
            <LinearGradient
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
                colors={optionSkin.screenGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
            />
            <Text accessible={false} style={{ color: optionSkin.text }}>
                {checked ? "◉" : "○"}
            </Text>
            <Text style={[ss.bodyFont, { color: optionSkin.text }]}>
                {label}
            </Text>
        </Pressable>
    );
}

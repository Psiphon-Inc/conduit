import React from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";

import {
    useAppAppearance,
    useAppearanceStyles,
} from "@/src/appearance/AppAppearance";
import type { AppSkinId } from "@/src/appearance/appSkins";

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

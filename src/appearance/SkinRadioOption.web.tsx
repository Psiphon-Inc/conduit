import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet } from "react-native";

import { useAppAppearance } from "@/src/appearance/AppAppearance";
import { APP_SKINS, type AppSkinId } from "@/src/appearance/appSkins";

/** HTML radio provides Space/arrow keys and checked state that RN Web Pressable lacks. */
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
    const checked = skin.id === id;
    const optionSkin = APP_SKINS[id];
    const input = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => {
        if (!focusOnMount || !checked) return;
        // Let Modal capture the trigger for focus restoration before moving
        // focus to the checked choice inside its focus trap.
        const frame = requestAnimationFrame(() => input.current?.focus());
        return () => cancelAnimationFrame(frame);
    }, [focusOnMount, checked]);
    return (
        <label
            style={{
                minHeight: 48,
                boxSizing: "border-box",
                padding: 12,
                borderRadius: 8,
                position: "relative",
                overflow: "hidden",
                border: `2px solid ${checked ? optionSkin.accent : optionSkin.border}`,
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                color: optionSkin.text,
                fontFamily: "JuraBold",
                fontSize: 18,
            }}
        >
            <LinearGradient
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
                colors={optionSkin.screenGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
            />
            <span
                style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                }}
            >
                <input
                    ref={input}
                    type="radio"
                    name="app-skin"
                    value={id}
                    checked={checked}
                    data-testid={`skin-${id}`}
                    onChange={() => onSelect(id)}
                    onClick={() => {
                        // Checked radios do not fire change again. They must still
                        // close the dropdown and retry a previously failed save.
                        if (checked) onSelect(id);
                    }}
                    style={{
                        accentColor: optionSkin.accent,
                        colorScheme:
                            optionSkin.navigationMode === "dark"
                                ? "dark"
                                : "light",
                        margin: 0,
                    }}
                />
                {label}
            </span>
        </label>
    );
}

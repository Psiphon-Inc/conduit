import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import {
    useAppAppearance,
    useAppearanceStyles,
} from "@/src/appearance/AppAppearance";
import { SkinRadioOption } from "@/src/appearance/SkinRadioOption";

/** Accessible skin radio choices; changes apply before persistence finishes. */
export function SkinPicker() {
    const { t } = useTranslation();
    const { persistence } = useAppAppearance();
    const ss = useAppearanceStyles();
    const options = [
        { id: "current", label: t("SKIN_CURRENT_I18N.string") },
        { id: "classic-dark", label: t("SKIN_CLASSIC_DARK_I18N.string") },
    ] as const;
    return (
        <View style={{ gap: 8, paddingVertical: 12 }}>
            <Text
                accessibilityRole="header"
                style={[ss.bodyFont, ss.blackText]}
            >
                {t("SETTINGS_APPEARANCE_I18N.string")}
            </Text>
            <View
                accessibilityRole="radiogroup"
                accessibilityLabel={t("SETTINGS_SKIN_I18N.string")}
                style={{ gap: 8 }}
            >
                {options.map((option) => (
                    <SkinRadioOption
                        key={option.id}
                        id={option.id}
                        label={option.label}
                    />
                ))}
            </View>
            {persistence === "unavailable" ? (
                <Text
                    accessibilityRole="alert"
                    style={[ss.tinyFont, ss.blackText]}
                >
                    {t("SKIN_SAVE_ERROR_I18N.string")}
                </Text>
            ) : null}
        </View>
    );
}

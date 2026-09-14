import React from "react";
import { useTranslation } from "react-i18next";
import {
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
    useAppAppearance,
    useAppearanceStyles,
} from "@/src/appearance/AppAppearance";
import { SkinRadioOption } from "@/src/appearance/SkinRadioOption";
import { APP_SKINS, type AppSkinId } from "@/src/appearance/appSkins";
import { Icon } from "@/src/components/Icon";

interface SkinPickerAnchor {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/** One settings row with anchored, modal skin choices; never expands the settings layout. */
export function SkinPicker() {
    const { t } = useTranslation();
    const { skin, persistence, selectSkin } = useAppAppearance();
    const ss = useAppearanceStyles();
    const trigger = React.useRef<View>(null);
    const [anchor, setAnchor] = React.useState<SkinPickerAnchor | null>(null);
    const [menuHeight, setMenuHeight] = React.useState(120);
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const close = React.useCallback(() => setAnchor(null), []);
    // A rotated/resized window invalidates the measured trigger position.
    React.useEffect(close, [close, width, height]);

    const label = t("SETTINGS_APPEARANCE_I18N.string");
    const failure = persistence === "unavailable";
    const warning = t("SKIN_SAVE_ERROR_I18N.string");
    const menuWidth = Math.min(320, width - insets.left - insets.right - 24);
    const topLimit = insets.top + 8;
    const bottomLimit = height - insets.bottom - 8;
    const left = anchor
        ? Math.max(
              insets.left + 12,
              Math.min(
                  anchor.x + anchor.width - menuWidth,
                  width - insets.right - menuWidth - 12,
              ),
          )
        : 0;
    const top = anchor
        ? Math.max(
              topLimit,
              Math.min(
                  anchor.y + anchor.height + 4 + menuHeight <= bottomLimit
                      ? anchor.y + anchor.height + 4
                      : anchor.y - menuHeight - 4,
                  bottomLimit - menuHeight,
              ),
          )
        : 0;

    function open() {
        trigger.current?.measureInWindow(
            (x, y, measuredWidth, measuredHeight) => {
                setAnchor({
                    x,
                    y,
                    width: measuredWidth,
                    height: measuredHeight,
                });
            },
        );
    }

    function chooseSkin(id: AppSkinId) {
        selectSkin(id);
        close();
    }

    return (
        <>
            <Pressable
                ref={trigger}
                testID="skin-picker"
                accessibilityRole="button"
                accessibilityLabel={`${label}, ${t(skin.labelKey)}`}
                accessibilityHint={failure ? warning : undefined}
                accessibilityState={{ expanded: anchor !== null }}
                aria-expanded={anchor !== null}
                aria-haspopup="dialog"
                onPress={open}
                style={{
                    minHeight: 60,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 8,
                    paddingHorizontal: Platform.OS === "web" ? 0 : 16,
                    borderBottomWidth: Platform.OS === "web" ? 1 : 0,
                    borderBottomColor: skin.border,
                }}
            >
                <Icon name="settings" color={skin.text} size={20} />
                <Text style={[ss.bodyFont, ss.blackText]}>{label}</Text>
                <Text
                    numberOfLines={1}
                    style={[
                        ss.tinyFont,
                        { flex: 1, textAlign: "right", color: skin.mutedText },
                    ]}
                >
                    {t(skin.labelKey)}
                </Text>
                {failure ? (
                    <Text
                        accessibilityRole="alert"
                        accessibilityLabel={warning}
                        style={{ color: skin.text }}
                    >
                        !
                    </Text>
                ) : null}
                <Icon name="chevron-down" color={skin.accent} size={16} />
            </Pressable>
            {anchor ? (
                <Modal
                    transparent
                    animationType="none"
                    presentationStyle="overFullScreen"
                    statusBarTranslucent={Platform.OS === "android"}
                    navigationBarTranslucent={Platform.OS === "android"}
                    onRequestClose={close}
                    accessibilityLabel={label}
                >
                    <View style={{ flex: 1 }} onAccessibilityEscape={close}>
                        <Pressable
                            testID="skin-picker-backdrop"
                            accessible={false}
                            focusable={false}
                            onPress={close}
                            style={StyleSheet.absoluteFill}
                        />
                        <View
                            testID="skin-picker-dropdown"
                            accessibilityViewIsModal
                            onLayout={(event) =>
                                setMenuHeight(event.nativeEvent.layout.height)
                            }
                            style={{
                                position: "absolute",
                                left,
                                top,
                                width: menuWidth,
                                maxHeight: bottomLimit - topLimit,
                                backgroundColor: skin.sharedSurface,
                                borderColor: skin.border,
                                borderWidth: 1,
                                borderRadius: 12,
                                padding: 6,
                                boxShadow: "0px 4px 18px rgba(0,0,0,0.25)",
                            }}
                        >
                            <ScrollView bounces={false}>
                                <View
                                    accessibilityRole="radiogroup"
                                    accessibilityLabel={t(
                                        "SETTINGS_SKIN_I18N.string",
                                    )}
                                >
                                    {Object.values(APP_SKINS).map((option) => (
                                        <SkinRadioOption
                                            key={option.id}
                                            id={option.id}
                                            label={t(option.labelKey)}
                                            onSelect={chooseSkin}
                                            focusOnMount
                                        />
                                    ))}
                                </View>
                                {failure ? (
                                    <Text
                                        style={[
                                            ss.tinyFont,
                                            ss.blackText,
                                            { padding: 12 },
                                        ]}
                                    >
                                        {warning}
                                    </Text>
                                ) : null}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            ) : null}
        </>
    );
}

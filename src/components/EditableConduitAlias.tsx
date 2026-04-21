/*
 * Copyright (c) 2026, Psiphon Inc.
 * All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from "react-native";

import {
    MAX_NICKNAME_LENGTH,
    countRunes,
    isValidNickname,
    normalizeNickname,
} from "@/src/common/precis";
import { Icon } from "@/src/components/Icon";
import { useModal } from "@/src/components/ModalStore";
import {
    QUERYKEY_CONDUIT_NAME,
    SECURESTORE_CONDUIT_NAME_KEY,
} from "@/src/constants";
import { useConduitName } from "@/src/hooks";
import {
    useHostedExperienceActions,
    useHostedExperienceState,
} from "@/src/hosted/experience/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

/**
 * A shared editable conduit alias field backed by SecureStore.
 * Tapping opens a modal (pushed onto the modal stack) with a text input.
 * Normalizes input per PRECIS RFC 8266 and validates before persisting.
 * Used in HostedConduitModal, PersonalPairingShareModal, and ConduitSettings.
 */
export function EditableConduitAlias({
    fallbackName,
    fontSize = 18,
    labelBackground,
}: {
    /** Fallback display name when no alias is stored */
    fallbackName?: string;
    /** Font size for the value text (default 18) */
    fontSize?: number;
    /** Background color behind the notched label (should match parent) */
    labelBackground?: string;
}) {
    const { t } = useTranslation();
    const { data: storedName } = useConduitName();
    const { pushModal, openModal, isOpen } = useModal();

    const hasStoredName = !!(storedName && storedName.trim().length > 0);
    const displayName = hasStoredName
        ? storedName
        : (fallbackName ?? t("NAME_YOUR_CONDUIT_I18N.string"));

    function handleOpen() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const nameEditor = (
            <ConduitNameEditorModal
                initialName={storedName ?? ""}
                fallbackName={t("NAME_YOUR_CONDUIT_I18N.string")}
            />
        );
        if (isOpen) {
            pushModal(nameEditor);
        } else {
            openModal(nameEditor);
        }
    }

    return (
        <Pressable
            onPress={handleOpen}
            style={{
                position: "relative",
                borderWidth: 1,
                borderColor: hasStoredName
                    ? palette.purple
                    : palette.thinPurple,
                borderRadius: 8,
                paddingHorizontal: 16,
                paddingVertical: 14,
            }}
        >
            {/* M3 notched label */}
            <Text
                style={{
                    position: "absolute",
                    top: -9,
                    left: 12,
                    backgroundColor: labelBackground ?? palette.white,
                    paddingHorizontal: 4,
                    fontSize: 12,
                    fontFamily: "JuraRegular",
                    color: hasStoredName ? palette.purple : palette.midGrey,
                }}
            >
                {t("ALIAS_I18N.string")}
            </Text>

            {/* Value / placeholder */}
            <Text
                numberOfLines={1}
                style={{
                    fontSize,
                    fontFamily: "JuraRegular",
                    color: hasStoredName ? palette.black : palette.peachyMauve,
                }}
            >
                {displayName}
            </Text>
        </Pressable>
    );
}

// ---------------------------------------------------------------------------
// ConduitNameEditorModal — the modal content for editing the name
// ---------------------------------------------------------------------------

function ConduitNameEditorModal({
    initialName,
    fallbackName,
}: {
    initialName: string;
    fallbackName?: string;
}) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { popModal } = useModal();
    const { authPhase } = useHostedExperienceState();
    const { updateAccountAlias } = useHostedExperienceActions();

    const [draft, setDraft] = React.useState(initialName);
    const [validationError, setValidationError] = React.useState<string | null>(
        null,
    );
    const inputRef = React.useRef<TextInput>(null);

    const runeCount = countRunes(normalizeNickname(draft, true));

    const persistMutation = useMutation({
        mutationFn: async (name: string) => {
            if (authPhase === "authenticated") {
                return updateAccountAlias(name);
            }

            await SecureStore.setItemAsync(SECURESTORE_CONDUIT_NAME_KEY, name);
            return name;
        },
        onSuccess: (result) => {
            const alias = typeof result === "string" ? result : result.alias;
            queryClient.setQueryData([QUERYKEY_CONDUIT_NAME], alias);
        },
        onError: (error) => {
            console.error("Failed to persist conduit alias:", error);
        },
    });

    React.useEffect(() => {
        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    function handleChangeText(text: string) {
        const normalized = normalizeNickname(text, true);
        setDraft(normalized);
        if (validationError) {
            setValidationError(null);
        }
    }

    function commit() {
        const normalized = normalizeNickname(draft);

        // Allow empty to clear the alias
        if (normalized.length === 0) {
            if (authPhase === "authenticated") {
                setValidationError(
                    t("CONDUIT_ALIAS_VALIDATION_ERROR_I18N.string", {
                        maxLength: MAX_NICKNAME_LENGTH,
                    }),
                );
                return;
            }
            setValidationError(null);
            if (initialName !== "") {
                persistMutation.mutate("");
            }
            popModal();
            return;
        }

        if (!isValidNickname(normalized)) {
            setValidationError(
                t("CONDUIT_ALIAS_VALIDATION_ERROR_I18N.string", {
                    maxLength: MAX_NICKNAME_LENGTH,
                }),
            );
            return;
        }

        setValidationError(null);
        if (normalized !== initialName) {
            persistMutation.mutate(normalized);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        popModal();
    }

    function dismiss() {
        popModal();
    }

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
            <Pressable
                onPress={dismiss}
                style={{
                    flex: 1,
                    justifyContent: "flex-end",
                    backgroundColor: palette.modalBgOverlay,
                }}
            >
                <Pressable
                    onPress={(e) => e.stopPropagation()}
                    style={{
                        backgroundColor: palette.white,
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 20,
                        paddingTop: 12,
                        paddingBottom: 24,
                        paddingHorizontal: 24,
                    }}
                >
                    {/* Header: X close + title */}
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 20,
                        }}
                    >
                        <Pressable onPress={dismiss} hitSlop={12}>
                            <Icon
                                name="close"
                                color={palette.black}
                                size={20}
                            />
                        </Pressable>
                        <Text
                            style={[
                                ss.bodyFont,
                                ss.blackText,
                                {
                                    fontSize: 20,
                                    fontWeight: "bold",
                                },
                            ]}
                        >
                            {t("INPUT_YOUR_CONDUIT_NAME_I18N.string")}
                        </Text>
                        <Pressable onPress={commit} hitSlop={12}>
                            <Icon
                                name="right-arrow"
                                color={palette.black}
                                size={20}
                            />
                        </Pressable>
                    </View>

                    {/* Visibility hint */}
                    <Text
                        style={[
                            ss.bodyFont,
                            {
                                fontSize: 14,
                                color: palette.midGrey,
                                opacity: 0.72,
                                marginBottom: 12,
                            },
                        ]}
                    >
                        {t("ALIAS_VISIBILITY_HINT_I18N.string")}
                    </Text>

                    {/* Text input */}
                    <TextInput
                        ref={inputRef}
                        value={draft}
                        onChangeText={handleChangeText}
                        onSubmitEditing={commit}
                        placeholder={
                            fallbackName ?? t("NAME_YOUR_CONDUIT_I18N.string")
                        }
                        placeholderTextColor={palette.peachyMauve}
                        style={[
                            ss.bodyFont,
                            ss.blackText,
                            {
                                fontSize: 18,
                                borderWidth: 1,
                                borderColor: validationError
                                    ? palette.red
                                    : palette.thinPurple,
                                borderRadius: 10,
                                paddingHorizontal: 16,
                                paddingVertical: 14,
                                backgroundColor: "#FFFFFF",
                            },
                        ]}
                        selectionColor={palette.purple}
                        maxLength={MAX_NICKNAME_LENGTH + 4}
                        autoCorrect={false}
                        autoCapitalize="words"
                        autoComplete="off"
                        returnKeyType="done"
                    />

                    {/* Validation / character count row */}
                    <View
                        style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginTop: 8,
                        }}
                    >
                        <View style={{ flex: 1 }}>
                            {validationError ? (
                                <Text
                                    style={[
                                        ss.tinyFont,
                                        { color: palette.red },
                                    ]}
                                >
                                    {validationError}
                                </Text>
                            ) : null}
                        </View>
                        <Text
                            style={[
                                ss.tinyFont,
                                {
                                    fontSize: 10,
                                    color:
                                        runeCount > MAX_NICKNAME_LENGTH
                                            ? palette.red
                                            : palette.midGrey,
                                },
                            ]}
                        >
                            {runeCount}/{MAX_NICKNAME_LENGTH}
                        </Text>
                    </View>
                </Pressable>
            </Pressable>
        </KeyboardAvoidingView>
    );
}

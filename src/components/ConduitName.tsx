/*
 * Copyright (c) 2024, Psiphon Inc.
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
import * as SecureStore from "expo-secure-store";
import React from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, Text, TextInput, View } from "react-native";

import {
    QUERYKEY_CONDUIT_NAME,
    SECURESTORE_CONDUIT_NAME_KEY,
} from "@/src/constants";
import { useConduitName } from "@/src/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

export function ConduitName() {
    const conduitName = useConduitName();

    if (conduitName.error) {
        return <Text style={[ss.whiteText, ss.bodyFont]}>Error</Text>;
    }

    // empty string is falsy, so we check specifically
    if (conduitName.data !== undefined) {
        return <EditableConduitName initialName={conduitName.data} />;
    } else {
        return null;
    }
}

// The Conduit Name is purely cosmetic, it is optional and only stored locally
export function EditableConduitName({ initialName }: { initialName: string }) {
    const { t } = useTranslation();

    const queryClient = useQueryClient();

    const mutateConduitName = useMutation({
        mutationFn: async (name: string) => {
            await SecureStore.setItemAsync(SECURESTORE_CONDUIT_NAME_KEY, name);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: [QUERYKEY_CONDUIT_NAME],
            });
        },
        onError: (error) => {
            console.error("Failed to mutate conduit name:", error);
        },
    });
    const [value, setValue] = React.useState(initialName);
    const [charsUsed, setCharsUsed] = React.useState(initialName.length);
    const [showCharsUsed, setShowCharsUsed] = React.useState(false);
    const maxLength = 22;

    async function onFocus() {
        setShowCharsUsed(true);
    }

    async function onEndEditing() {
        setShowCharsUsed(false);
        if (value !== initialName) {
            await mutateConduitName.mutateAsync(value);
        }
    }

    // Hook up a keyboard event listener so we can call onBlur on keyboard
    // getting dismissed. This also triggers onEndEditing, which submits the
    // updated value to the mutation.
    const textInputRef = React.useRef<TextInput>(null);
    React.useEffect(() => {
        const keyboardDidHideSubscription = Keyboard.addListener(
            "keyboardDidHide",
            () => {
                if (textInputRef.current) {
                    textInputRef.current.blur();
                }
            },
        );

        return () => {
            keyboardDidHideSubscription.remove();
        };
    }, []);

    function onChangeText(text: string) {
        setValue(text);
        setCharsUsed(text.length);
    }

    return (
        <View style={[ss.fullHeight, ss.flex, ss.row, ss.alignCenter]}>
            <TextInput
                ref={textInputRef}
                style={[
                    ss.flex,
                    ss.whiteText,
                    ss.bodyFont,
                    ss.midGreyBorder,
                    ss.rounded10,
                    ss.padded,
                ]}
                placeholder={t("NAME_YOUR_CONDUIT_I18N.string")}
                placeholderTextColor={palette.midGrey}
                onChangeText={onChangeText}
                onFocus={onFocus}
                onEndEditing={onEndEditing}
                value={value}
                selectionColor={palette.blue}
                maxLength={maxLength}
                autoCorrect={false}
                autoComplete={"off"}
            />
            {showCharsUsed && (
                <View style={[ss.absoluteBottomRight]}>
                    <Text style={[ss.greyText, ss.tinyFont]}>
                        {charsUsed}/{maxLength}
                    </Text>
                </View>
            )}
        </View>
    );
}

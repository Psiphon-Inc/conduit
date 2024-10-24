import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import React from "react";
import { useTranslation } from "react-i18next";
import { Text, TextInput, View } from "react-native";

import {
    QUERYKEY_CONDUIT_NAME,
    SECURESTORE_CONDUIT_NAME_KEY,
} from "@/src/constants";
import { palette, sharedStyles as ss } from "@/src/styles";

export function ConduitName() {
    const conduitName = useQuery({
        queryKey: [QUERYKEY_CONDUIT_NAME],
        queryFn: async () => {
            const storedConduitName = await SecureStore.getItemAsync(
                SECURESTORE_CONDUIT_NAME_KEY,
            );
            if (storedConduitName == null) {
                return "";
            } else {
                return storedConduitName;
            }
        },
    });

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
    const maxLength = 30;

    async function onFocus() {
        setShowCharsUsed(true);
    }

    async function onBlur() {
        setShowCharsUsed(false);
        if (value !== initialName) {
            await mutateConduitName.mutateAsync(value);
        }
    }

    function onChangeText(text: string) {
        setValue(text);
        setCharsUsed(text.length);
    }

    return (
        <View style={[ss.fullHeight, ss.flex, ss.row, ss.alignCenter]}>
            <TextInput
                style={[
                    ss.flex,
                    ss.whiteText,
                    ss.bodyFont,
                    ss.midGreyBorder,
                    ss.rounded10,
                    ss.paddedHorizontal,
                    { height: "100%" },
                ]}
                placeholder={t("NAME_YOUR_CONDUIT_I18N.string")}
                placeholderTextColor={palette.midGrey}
                onChangeText={onChangeText}
                onFocus={onFocus}
                onBlur={onBlur}
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
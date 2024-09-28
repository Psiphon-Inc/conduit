import { Feather } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import {
    iconButton,
    lineItemStyle,
    palette,
    sharedStyles as ss,
} from "@/src/styles";

export function EditableNumberSlider({
    label,
    originalValue,
    min,
    max,
    step,
    units = "",
    style = lineItemStyle,
    onCommit,
}: {
    label: string;
    originalValue: number;
    min: number;
    max: number;
    step: number;
    units?: string;
    style?: any;
    onCommit: (newValue: number) => Promise<void>;
}) {
    const { t } = useTranslation();
    const [value, setValue] = React.useState<number>(originalValue);
    const [isEditing, setIsEditing] = React.useState(false);

    async function commit() {
        if (value === originalValue) {
            setIsEditing(false);
        } else {
            await onCommit(value);
            setIsEditing(false);
        }
    }

    if (!isEditing) {
        return (
            <View style={[...style, ss.flex, ss.justifySpaceBetween]}>
                <Text style={[ss.bodyFont, ss.whiteText]}>{label}</Text>
                <View style={[ss.row, ss.alignCenter]}>
                    <View style={[ss.row, ss.alignCenter, ss.nogap]}>
                        <View
                            style={[
                                ss.circle38,
                                ss.justifyCenter,
                                ss.alignCenter,
                            ]}
                        >
                            <Text style={[ss.boldFont, ss.whiteText]}>
                                {value}
                            </Text>
                        </View>
                        <Text style={[ss.bodyFont, ss.whiteText]}>{units}</Text>
                    </View>
                    <Pressable
                        style={iconButton}
                        onPress={() => setIsEditing(true)}
                    >
                        <Feather
                            name="edit-2"
                            size={24}
                            color={palette.black}
                        />
                    </Pressable>
                </View>
            </View>
        );
    } else {
        return (
            <View style={[...style, ss.flex, ss.justifySpaceBetween]}>
                <Slider
                    style={{ flex: 1, height: "100%" }}
                    minimumValue={min}
                    maximumValue={max}
                    step={step}
                    value={value}
                    onValueChange={(value) => setValue(value)}
                    maximumTrackTintColor="white"
                    minimumTrackTintColor={palette.white}
                    thumbTintColor={palette.white}
                />
                <View style={[ss.row, ss.alignCenter]}>
                    <View style={[ss.row, ss.alignCenter, ss.nogap]}>
                        <View
                            style={[
                                ss.circle50,
                                ss.justifyCenter,
                                ss.alignCenter,
                            ]}
                        >
                            <Text style={[ss.boldFont, ss.whiteText]}>
                                {value}
                                <Text style={[ss.whiteText, ss.bodyFont]}>
                                    {value === originalValue ? "" : "*"}
                                </Text>
                            </Text>
                        </View>
                        <Text style={[ss.bodyFont, ss.whiteText]}>{units}</Text>
                    </View>
                    <View
                        style={[
                            ss.halfPadded,
                            ss.rounded10,
                            { backgroundColor: palette.white },
                        ]}
                    >
                        <Pressable onPress={commit}>
                            <Text style={[ss.blackText, ss.bodyFont]}>
                                {t("SAVE_I18N.string")}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        );
    }
}

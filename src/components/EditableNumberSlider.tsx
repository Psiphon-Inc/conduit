import { MaterialIcons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { lineItemStyle, palette, sharedStyles as ss } from "@/src/styles";

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
                        style={[
                            ss.circle38,
                            ss.justifyCenter,
                            ss.alignCenter,
                            {
                                backgroundColor: palette.redTint2,
                            },
                        ]}
                        onPress={() => setIsEditing(true)}
                    >
                        <MaterialIcons
                            name="edit"
                            size={20}
                            color={palette.white}
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
                    minimumTrackTintColor={palette.redTint2}
                    thumbTintColor={palette.redTint2}
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
                            { backgroundColor: palette.redTint2 },
                        ]}
                    >
                        <Pressable onPress={commit}>
                            <Text style={[ss.whiteText, ss.bodyFont]}>
                                {t("SAVE_I18N.string")}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        );
    }
}

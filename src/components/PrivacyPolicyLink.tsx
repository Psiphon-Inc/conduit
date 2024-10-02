import * as Linking from "expo-linking";
import { useTranslation } from "react-i18next";
import { Pressable, Text } from "react-native";

import { PRIVACY_POLICY_URL } from "@/src/constants";
import { sharedStyles as ss } from "@/src/styles";

export function PrivacyPolicyLink() {
    const { t } = useTranslation();

    return (
        <Pressable
            style={[
                ss.absolute,
                ss.row,
                ss.justifyCenter,
                ss.fullWidth,
                ss.padded,
                { bottom: 0 },
            ]}
            onPress={() => {
                Linking.openURL(PRIVACY_POLICY_URL);
            }}
        >
            <Text style={[ss.greyText, ss.bodyFont]}>
                {t("PRIVACY_POLICY_I18N.string")}
            </Text>
        </Pressable>
    );
}

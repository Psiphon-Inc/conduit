import { router } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuthContext } from "@/src/auth/context";
import { handleError } from "@/src/common/errors";

export default function Index() {
    const insets = useSafeAreaInsets();
    const { signIn } = useAuthContext();
    const { t } = useTranslation();

    React.useEffect(() => {
        signIn().then((result) => {
            if (result instanceof Error) {
                handleError(result);
            } else {
                // Route to home screen as soon as the credentials are loaded,
                // this may happen before the splash animation fully completes
                // replace as we do not want user to be able to go "back" to
                // the splash screen
                router.replace("/(app)/");
            }
        });
    }, []);

    return (
        <View
            style={{
                flex: 1,
                marginTop: insets.top,
                marginBottom: insets.bottom,
                marginLeft: insets.left,
                marginRight: insets.right,
            }}
        >
            <View
                style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                }}
            >
                <Text style={{ color: "white" }}>
                    {t("LOADING_I18N.string")}
                </Text>
                <ActivityIndicator color="white" size="large" />
            </View>
        </View>
    );
}

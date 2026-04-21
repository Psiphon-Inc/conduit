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
import { useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { SafeAreaView } from "@/src/components/SafeAreaView";
import { sharedStyles as ss } from "@/src/styles";

export default function SSOCallbackScreen() {
    const { t } = useTranslation();
    const router = useRouter();

    React.useEffect(() => {
        router.replace("/(app)/hosted-setup");
    }, [router]);

    return (
        <SafeAreaView>
            <View
                style={[ss.flex, ss.justifyCenter, ss.alignCenter, ss.padded]}
            >
                <Text style={[ss.bodyFont, ss.blackText]}>
                    {t("COMPLETING_SIGN_IN_I18N.string")}
                </Text>
            </View>
        </SafeAreaView>
    );
}

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

import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { z } from "zod";

import { useConduitKeyPair } from "@/src/auth/hooks";
import { keyPairToBase64nopad } from "@/src/common/cryptography";
import { QRDisplay } from "@/src/components/QRDisplay";
import { useConduitName } from "@/src/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

export const conduitScanData = z.object({
    version: z.number(),
    data: z.object({
        key: z.string().length(86, { message: "INVALID_QR_CODE_I18N.string" }),
        name: z.string().optional(),
    }),
});

export default function LinkConduitScreen() {
    const win = useWindowDimensions();
    const router = useRouter();
    const { t } = useTranslation();

    const conduitKeyPair = useConduitKeyPair();
    const conduitName = useConduitName();

    if (!conduitKeyPair.data) {
        return (
            <View
                style={{
                    width: "100%",
                    height: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <Text style={[ss.bodyFont, ss.whiteText]}>
                    Loading conduit data...
                </Text>
            </View>
        );
    }

    const keydata = keyPairToBase64nopad(conduitKeyPair.data);
    if (keydata instanceof Error) {
        return (
            <View
                style={{
                    width: "100%",
                    height: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <Text style={[ss.bodyFont, ss.whiteText]}>
                    Error formatting keydata
                </Text>
            </View>
        );
    }

    const data = conduitScanData.parse({
        version: 1,
        data: {
            key: keydata,
            name: conduitName.data,
        },
    } as z.infer<typeof conduitScanData>);

    function onClose() {
        router.back();
    }

    return (
        <View
            style={[
                ss.column,
                ss.absoluteFill,
                ss.flex,
                ss.justifyCenter,
                ss.alignCenter,
            ]}
        >
            <Text style={[ss.whiteText, ss.bodyFont]}>
                {t("SCAN_THIS_FROM_RYVE_APP_I18N.string")}
            </Text>
            <View
                style={[
                    ss.justifyCenter,
                    ss.alignCenter,
                    ss.whiteBg,
                    ss.padded,
                ]}
            >
                <QRDisplay
                    backgroundColor={palette.white}
                    foregroundColor={palette.black}
                    size={win.width * 0.9}
                    data={JSON.stringify(data)}
                />
            </View>
            <Pressable
                style={[
                    ss.row,
                    ss.alignCenter,
                    ss.rounded5,
                    ss.halfPadded,
                    {
                        backgroundColor: palette.white,
                    },
                ]}
                onPress={onClose}
            >
                <Text style={[ss.blackText, ss.extraLargeFont]}>
                    {t("CLOSE_I18N.string")}
                </Text>
            </Pressable>
        </View>
    );
}

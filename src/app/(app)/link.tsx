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

import { View } from "react-native";
import QRCode from "react-native-qrcode-skia";
import { useSharedValue } from "react-native-reanimated";
import { z } from "zod";

import { useConduitKeyPair } from "@/src/auth/hooks";
import { keyPairToBase64nopad } from "@/src/common/cryptography";
import { PsiphonConduitLoading } from "@/src/components/canvas/PsiphonConduitLoading";
import { useConduitName } from "@/src/hooks";
import { sharedStyles as ss } from "@/src/styles";

export const conduitScanData = z.object({
    version: z.number(),
    data: z.object({
        key: z.string().length(86, { message: "INVALID_QR_CODE_I18N.string" }),
        name: z.string().optional(),
    }),
});

export default function LinkConduitScreen() {
    const conduitKeyPair = useConduitKeyPair();
    const conduitName = useConduitName();

    const opacity = useSharedValue(1);

    if (!conduitKeyPair.data || !conduitName.data) {
        return <PsiphonConduitLoading size={50} opacity={opacity} />;
    }

    const keydata = keyPairToBase64nopad(conduitKeyPair.data);
    if (keydata instanceof Error) {
        return <PsiphonConduitLoading size={50} opacity={opacity} />;
    }
    const data = conduitScanData.parse({
        version: 1,
        data: {
            key: keydata,
            name: conduitName.data,
        },
    } as z.infer<typeof conduitScanData>);

    return (
        <View
            style={[ss.absoluteFill, ss.flex, ss.justifyCenter, ss.alignCenter]}
        >
            <View
                style={[
                    ss.justifyCenter,
                    ss.alignCenter,
                    ss.whiteBg,
                    ss.padded,
                ]}
            >
                <QRCode
                    value={JSON.stringify(data)}
                    size={300}
                    shapeOptions={{
                        shape: "square",
                    }}
                />
            </View>
        </View>
    );
}

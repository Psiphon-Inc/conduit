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
import * as Clipboard from "expo-clipboard";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { Identicon } from "@/src/components/Identicon";
import { sharedStyles as ss } from "@/src/styles";

export function ProxyID({
    proxyId,
    copyable = true,
}: {
    proxyId: string;
    copyable?: boolean;
}) {
    // proxyId is a base64nopad encoded X25519 public key
    async function copyProxyIdToClipboard() {
        await Clipboard.setStringAsync(proxyId);
    }

    return (
        <Pressable
            style={[ss.row, ss.alignCenter, ss.rounded5]}
            onPress={() => {
                copyable && copyProxyIdToClipboard();
            }}
        >
            <View
                style={{
                    width: 42,
                    height: 42,
                    borderWidth: 1,
                    borderRadius: 20,
                }}
            >
                <Identicon value={proxyId} size={40} />
            </View>
            <Text style={[ss.greyText, ss.bodyFont]}>
                ({proxyId.substring(0, 4)}...)
            </Text>
        </Pressable>
    );
}

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

import { Icon } from "@/src/components/Icon";
import { Jdenticon } from "@/src/components/Jdenticon";
import { palette, sharedStyles as ss } from "@/src/styles";

export function ProxyID({
    proxyId,
    copyable = true,
}: {
    proxyId: string;
    copyable?: boolean;
}) {
    // proxyId is a base64nopad encoded X25519 public key
    const [copyIcon, setCopyIcon] = React.useState(
        <Icon name="copy" size={24} color={palette.black} />,
    );

    function showCopySuccess() {
        setCopyIcon(<Icon name="check" size={24} color={palette.black} />);
        setTimeout(() => {
            setCopyIcon(<Icon name="copy" size={24} color={palette.black} />);
        }, 2500);
    }

    async function copyProxyIdToClipboard() {
        await Clipboard.setStringAsync(proxyId);
        showCopySuccess();
    }

    return (
        <View style={[ss.row, ss.alignCenter, ss.rounded5]}>
            <View
                style={{
                    width: 40,
                    height: 40,
                }}
            >
                <Jdenticon value={proxyId} size={40} />
            </View>
            <Text style={[ss.greyText, ss.bodyFont]}>
                ({proxyId.substring(0, 4)}...)
            </Text>
            {copyable && (
                <Pressable
                    onPress={copyProxyIdToClipboard}
                    style={[ss.rounded5, ss.whiteBg, ss.halfPadded]}
                >
                    {copyIcon}
                </Pressable>
            )}
        </View>
    );
}

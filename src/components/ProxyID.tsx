import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React from "react";
import { Pressable, Text, View } from "react-native";

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
        <Feather name="copy" size={24} color={palette.black} />,
    );

    function showCopySuccess() {
        setCopyIcon(<Feather name="check" size={24} color={palette.black} />);
        setTimeout(() => {
            setCopyIcon(
                <Feather name="copy" size={24} color={palette.black} />,
            );
        }, 2500);
    }

    async function copyProxyIdToClipboard() {
        await Clipboard.setStringAsync(proxyId);
        showCopySuccess();
    }

    return (
        <Pressable onPress={copyProxyIdToClipboard}>
            <View
                style={[
                    ss.row,
                    ss.alignCenter,
                    ss.rounded5,
                    ss.halfPadded,
                    {
                        backgroundColor: palette.white,
                    },
                ]}
            >
                <Text style={[ss.blackText, ss.bodyFont]}>
                    {proxyId.substring(0, 4)}...
                </Text>
                {copyable && copyIcon}
            </View>
        </Pressable>
    );
}

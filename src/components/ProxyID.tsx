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
        <Icon name="copy" size={24} color={palette.white} />,
    );

    function showCopySuccess() {
        setCopyIcon(<Icon name="check" size={24} color={palette.white} />);
        setTimeout(() => {
            setCopyIcon(<Icon name="copy" size={24} color={palette.white} />);
        }, 2500);
    }

    async function copyProxyIdToClipboard() {
        await Clipboard.setStringAsync(proxyId);
        showCopySuccess();
    }

    return (
        <Pressable onPress={copyProxyIdToClipboard}>
            <View style={[ss.row, ss.alignCenter, ss.rounded5, ss.halfPadded]}>
                <Text style={[ss.whiteText, ss.bodyFont]}>
                    {proxyId.substring(0, 4)}...
                </Text>
                <View
                    style={{
                        width: 40,
                        height: 40,
                    }}
                >
                    <Jdenticon value={proxyId} size={40} />
                </View>
                {copyable && copyIcon}
            </View>
        </Pressable>
    );
}

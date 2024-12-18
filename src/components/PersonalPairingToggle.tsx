import React from "react";
import { Switch, View } from "react-native";

import { palette, sharedStyles as ss } from "@/src/styles";

export function PersonalPairingToggle({
    originalValue,
    onChange,
}: {
    originalValue: boolean;
    onChange: any;
}) {
    const [localState, setLocalState] = React.useState(originalValue);

    function update() {
        setLocalState((previous) => !previous);
        onChange();
    }

    return (
        <View style={[ss.row]}>
            <Switch
                trackColor={{
                    false: palette.blue,
                    true: palette.blue,
                }}
                thumbColor={localState ? palette.blue : palette.grey}
                ios_backgroundColor={palette.blue}
                onValueChange={update}
                value={localState}
            />
        </View>
    );
}

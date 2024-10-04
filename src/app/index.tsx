import { Canvas } from "@shopify/react-native-skia";
import { router } from "expo-router";
import React from "react";
import { View, useWindowDimensions } from "react-native";
import { runOnJS, useSharedValue, withTiming } from "react-native-reanimated";

import { useAuthContext } from "@/src/auth/context";
import { timedLog } from "@/src/common/utils";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { PsiphonConduitLoading } from "@/src/components/canvas/PsiphonConduitLoading";
import { sharedStyles as ss } from "@/src/styles";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Index() {
    const { signIn } = useAuthContext();
    const win = useWindowDimensions();

    const canvasSize = win.width / 3;

    const opacity = useSharedValue(0);

    async function doSignIn() {
        timedLog("Starting signIn");
        const signInResult = await signIn();
        if (signInResult instanceof Error) {
            // TODO: Right now we will never learn about signIn errors since
            // we can't record error into feedback log yet
            // Show some error state in the UI with some steps to fix?
            console.error(signInResult);
        } else {
            const hasOnboarded = await AsyncStorage.getItem("hasOnboarded");
            timedLog(`signIn complete, hasOnboarded: ${hasOnboarded}`);
            opacity.value = withTiming(0, { duration: 400 }, () => {
                if (hasOnboarded !== null) {
                    runOnJS(router.replace)("/(app)/");
                } else {
                    runOnJS(router.replace)("/(app)/intro");
                }
            });
        }
    }

    React.useEffect(() => {
        timedLog("app/index rendered");
        // NOTE: This is introducing an artificial delay of 1 second to have the
        // nice fade in before signing in, since sign in is nearly instant now
        // that we are storing the derived conduit key in SecureStore.
        opacity.value = withTiming(1, { duration: 1000 }, () =>
            runOnJS(doSignIn)(),
        );
    }, []);

    return (
        <SafeAreaView>
            <View
                style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                }}
            >
                <View
                    style={{
                        width: canvasSize,
                        height: canvasSize,
                    }}
                >
                    <Canvas style={[ss.flex]}>
                        <PsiphonConduitLoading
                            size={canvasSize}
                            opacity={opacity}
                        />
                    </Canvas>
                </View>
            </View>
        </SafeAreaView>
    );
}

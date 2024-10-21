import AsyncStorage from "@react-native-async-storage/async-storage";
import { Canvas } from "@shopify/react-native-skia";
import { useRouter } from "expo-router";
import React from "react";
import { View, useWindowDimensions } from "react-native";
import { runOnJS, useSharedValue, withTiming } from "react-native-reanimated";

import { useAuthContext } from "@/src/auth/context";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { PsiphonConduitLoading } from "@/src/components/canvas/PsiphonConduitLoading";
import { ASYNCSTORAGE_HAS_ONBOARDED_KEY } from "@/src/constants";
import { sharedStyles as ss } from "@/src/styles";

export default function Index() {
    const { signIn } = useAuthContext();
    const win = useWindowDimensions();
    const router = useRouter();

    const canvasSize = win.width / 3;

    const opacity = useSharedValue(0);

    async function doSignIn() {
        const signInResult = await signIn();
        if (signInResult instanceof Error) {
            // Throw the error so we know about it, signIn must succeed.
            throw signInResult;
        } else {
            const hasOnboarded = await AsyncStorage.getItem(
                ASYNCSTORAGE_HAS_ONBOARDED_KEY,
            );
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

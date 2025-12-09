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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React from "react";
import { View, useWindowDimensions } from "react-native";
import { runOnJS, useSharedValue, withTiming } from "react-native-reanimated";

import { useAuthContext } from "@/src/auth/context";
import { wrapError } from "@/src/common/errors";
import { SafeAreaView } from "@/src/components/SafeAreaView";
import { SkyBox } from "@/src/components/SkyBox";
import { PsiphonConduitLoading } from "@/src/components/canvas/PsiphonConduitLoading";
import {
    ASYNCSTORAGE_HAS_ONBOARDED_KEY,
    CURRENT_STORAGE_VERSION,
} from "@/src/constants";
import { applyMigrations } from "@/src/migrations";

export default function Index() {
    const { signIn } = useAuthContext();
    const win = useWindowDimensions();
    const router = useRouter();

    const loadingIndicatorCanvasSize = win.width / 2;

    const opacity = useSharedValue(0);

    async function loadApp() {
        // Apply any storage migrations
        const appliedStorageVersion = await applyMigrations();
        if (appliedStorageVersion instanceof Error) {
            // This will crash the app.
            throw wrapError(
                appliedStorageVersion,
                "Could not apply migrations",
            );
        }
        if (appliedStorageVersion !== CURRENT_STORAGE_VERSION) {
            // This will crash the app.
            throw Error(
                `Storage version ${appliedStorageVersion} did not match expected value ${CURRENT_STORAGE_VERSION}`,
            );
        }

        // Prepare account material and route to main view
        const signInResult = await signIn();
        if (signInResult instanceof Error) {
            // This will crash the app.
            throw signInResult;
        } else {
            const hasOnboarded = await AsyncStorage.getItem(
                ASYNCSTORAGE_HAS_ONBOARDED_KEY,
            );
            opacity.value = withTiming(0, { duration: 300 }, () => {
                if (hasOnboarded !== null) {
                    runOnJS(router.replace)("/(app)");
                } else {
                    runOnJS(router.replace)("/(app)/onboarding");
                }
            });
        }
    }

    React.useEffect(() => {
        // This is introducing an artificial delay of 500ms to have the nice
        // fade in before signing in, since sign in is nearly instant.
        opacity.value = withTiming(1, { duration: 1000 }, () =>
            runOnJS(loadApp)(),
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
                <SkyBox />
                <View
                    style={{
                        width: loadingIndicatorCanvasSize,
                        height: loadingIndicatorCanvasSize,
                    }}
                >
                    <PsiphonConduitLoading />
                </View>
            </View>
        </SafeAreaView>
    );
}

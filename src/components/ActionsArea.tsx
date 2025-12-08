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
import React from "react";
import { View } from "react-native";
import { useSharedValue, withDelay, withTiming } from "react-native-reanimated";

import { useInproxyStatus } from "@/src/inproxy/hooks";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConduitSettings } from "./ConduitSettings";
import { GitHash } from "./GitHash";
import { RyveCallToAction } from "./RyveCallToAction";

export function ActionsArea({
    width,
    height,
}: {
    width: number;
    height: number;
}) {
    const insets = useSafeAreaInsets();

    const { data: inproxyStatus } = useInproxyStatus();

    // Fade in gradient on app start
    const fadeIn = useSharedValue(0);
    const fader = useSharedValue(0);
    const shouldAnimateIn = React.useRef(true);
    const shouldAnimateOut = React.useRef(true);

    React.useEffect(() => {
        if (inproxyStatus !== "UNKNOWN") {
            fadeIn.value = withDelay(0, withTiming(1, { duration: 2000 }));
        }
        if (inproxyStatus === "RUNNING") {
            if (shouldAnimateIn.current) {
                fader.value = withTiming(1, { duration: 1000 });
                shouldAnimateIn.current = false;
                shouldAnimateOut.current = true;
            }
        } else if (inproxyStatus === "STOPPED") {
            if (shouldAnimateOut.current) {
                fader.value = withTiming(0, { duration: 1000 });
                shouldAnimateIn.current = true;
                shouldAnimateOut.current = false;
            }
        }
    }, [inproxyStatus]);

    return (
        <View
            style={[
                {
                    position: "absolute",
                    bottom: insets.bottom,
                    width: width,
                    height: height,
                    justifyContent: "space-between",
                    alignItems: "center",
                },
            ]}
        >
            <RyveCallToAction />
            <View
                style={{
                    flexDirection: "row",
                    width: "100%",
                    height: 70,
                    justifyContent: "space-between",
                    paddingHorizontal: 5,
                }}
            >
                <GitHash />
                <View
                    style={{
                        flexDirection: "row",
                    }}
                >
                    <ConduitSettings />
                </View>
            </View>
        </View>
    );
}

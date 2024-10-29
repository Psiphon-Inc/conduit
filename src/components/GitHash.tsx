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
import Animated, {
    useSharedValue,
    withDelay,
    withTiming,
} from "react-native-reanimated";

import { PARTICLE_VIDEO_DELAY_MS } from "@/src/constants";
// @ts-ignore (this file is gitignored)
import { GIT_HASH } from "@/src/git-hash";
import { useInproxyStatus } from "@/src/inproxy/hooks";
import { palette, sharedStyles as ss } from "@/src/styles";

export function GitHash() {
    const { data: inproxyStatus } = useInproxyStatus();

    const opacity = useSharedValue(0);
    if (inproxyStatus !== "UNKNOWN") {
        opacity.value = withDelay(
            inproxyStatus === "STOPPED" ? PARTICLE_VIDEO_DELAY_MS : 0,
            withTiming(0.8, { duration: 2000 }),
        );
    }

    return (
        <View style={[ss.absoluteBottomLeft]}>
            <Animated.Text
                style={[
                    { color: palette.blueShade2, opacity: opacity },
                    ss.bodyFont,
                ]}
            >
                v.{GIT_HASH.substring(0, 12)}
            </Animated.Text>
        </View>
    );
}

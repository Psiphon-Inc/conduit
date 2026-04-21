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
import Animated from "react-native-reanimated";

// @ts-ignore (this file is gitignored)
import { GIT_HASH } from "@/src/git-hash";
import { palette, sharedStyles as ss } from "@/src/styles";

export function GitHash() {
    return (
        <View
            style={{
                justifyContent: "flex-end",
                alignItems: "flex-end",
                paddingLeft: 15,
            }}
        >
            <Animated.Text
                style={[
                    ss.bodyFont,
                    { color: palette.lightGrey, fontSize: 14 },
                ]}
            >
                v.{GIT_HASH.substring(0, 12)}
            </Animated.Text>
        </View>
    );
}

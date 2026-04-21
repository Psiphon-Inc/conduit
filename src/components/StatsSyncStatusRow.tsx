/*
 * Copyright (c) 2026, Psiphon Inc.
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
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import Animated, {
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";

import { formatUpdatedAt } from "@/src/common/formatters";
import { palette, sharedStyles as ss } from "@/src/styles";

export function StatsSyncStatusRow({
    updatedAt,
    isSyncing,
}: {
    updatedAt: string | null;
    isSyncing: boolean;
}) {
    const { t } = useTranslation();
    const syncingOpacity = useSharedValue(isSyncing ? 1 : 0);

    React.useEffect(() => {
        if (isSyncing) {
            syncingOpacity.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 220 }),
                    withTiming(0.35, { duration: 760 }),
                ),
                -1,
                false,
            );
            return;
        }

        cancelAnimation(syncingOpacity);
        syncingOpacity.value = withTiming(0, { duration: 180 });
    }, [isSyncing, syncingOpacity]);

    const syncingStyle = useAnimatedStyle(() => ({
        opacity: syncingOpacity.value,
    }));

    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
            }}
        >
            <Text style={[ss.tinyFont, { color: palette.midGrey }]}>
                {formatUpdatedAt(updatedAt)}
            </Text>
            {isSyncing ? (
                <Animated.Text
                    style={[
                        ss.tinyFont,
                        { color: palette.midGrey },
                        syncingStyle,
                    ]}
                >
                    {t("SYNCING_I18N.string")}
                </Animated.Text>
            ) : null}
        </View>
    );
}

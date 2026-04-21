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
import * as Haptics from "expo-haptics";
import { Href, usePathname, useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { InteractionManager, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/src/components/Icon";
import { palette, sharedStyles as ss } from "@/src/styles";

type BottomNavItem = {
    key: "home" | "analytics" | "settings";
    icon: React.ComponentProps<typeof Icon>["name"];
    label: string;
    href: Href;
    isActive: boolean;
};

export function AppBottomNav() {
    const { t } = useTranslation();
    const router = useRouter();
    const pathname = usePathname();
    const insets = useSafeAreaInsets();

    const isHomeActive = pathname === "/" || pathname === "/(app)";
    const isAnalyticsActive =
        pathname.startsWith("/hosted-dashboard") ||
        pathname.startsWith("/(app)/hosted-dashboard");
    const isSettingsActive =
        pathname === "/settings" || pathname === "/(app)/settings";

    const items: BottomNavItem[] = [
        {
            key: "home",
            icon: "home",
            label: t("HOME_I18N.string"),
            href: "/(app)",
            isActive: isHomeActive,
        },
        {
            key: "analytics",
            icon: "analytics",
            label: t("DASHBOARD_I18N.string"),
            href: "/(app)/hosted-dashboard",
            isActive: isAnalyticsActive,
        },
        {
            key: "settings",
            icon: "settings",
            label: t("SETTINGS_I18N.string"),
            href: "/(app)/settings",
            isActive: isSettingsActive,
        },
    ];

    React.useEffect(() => {
        let cancelled = false;
        let warmed = false;
        const warm = () => {
            if (cancelled || warmed) {
                return;
            }
            warmed = true;
            void Promise.allSettled([
                import("@/src/app/(app)/hosted-dashboard"),
                import("@/src/app/(app)/settings"),
            ]);
        };

        const task = InteractionManager.runAfterInteractions(() => {
            if (cancelled) {
                return;
            }
            warm();
        });
        const fallbackTimer = setTimeout(warm, 1200);
        return () => {
            cancelled = true;
            task.cancel();
            clearTimeout(fallbackTimer);
        };
    }, []);

    return (
        <View
            style={{
                borderTopWidth: 1,
                borderTopColor: palette.thinPurple,
                backgroundColor: palette.white,
                paddingTop: 8,
                paddingBottom: Math.max(8, insets.bottom),
                paddingHorizontal: 8,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
            }}
        >
            {items.map((item) => {
                const color = item.isActive ? palette.purple : palette.black;
                return (
                    <Pressable
                        key={item.key}
                        accessibilityRole="button"
                        accessibilityLabel={item.label}
                        onPressIn={() => {
                            if (!item.isActive) {
                                void Haptics.impactAsync(
                                    Haptics.ImpactFeedbackStyle.Light,
                                );
                                router.replace(item.href);
                            }
                        }}
                        style={{
                            flex: 1,
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                            paddingVertical: 4,
                        }}
                    >
                        <Icon name={item.icon} size={24} color={color} />
                        <Text style={[ss.tinyFont, { color }]}>
                            {item.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

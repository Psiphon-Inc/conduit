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
import { UseQueryResult, useQuery } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import React from "react";
import { AccessibilityInfo, AppState, Platform } from "react-native";
import { z } from "zod";

import { loadCachedAlias } from "@/src/common/conduitAlias";
import {
    QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID,
    QUERYKEY_CONDUIT_NAME,
    QUERYKEY_NOTIFICATIONS_PERMISSIONS,
} from "@/src/constants";
import { PersonalCompartmentId } from "@/src/pairing/compartmentId";
import { loadAndroidPersonalCompartmentId } from "@/src/personalCompartmentId";

const PermissionsStatusSchema = z.enum([
    "GRANTED",
    "NOT_GRANTED_CAN_ASK",
    "NOT_GRANTED_CANT_ASK",
]);
type PermissionsStatus = z.infer<typeof PermissionsStatusSchema>;

export function useAppIsActive(): boolean {
    const [isActive, setIsActive] = React.useState(
        AppState.currentState === "active",
    );

    React.useEffect(() => {
        const subscription = AppState.addEventListener("change", (state) => {
            setIsActive(state === "active");
        });
        return () => subscription.remove();
    }, []);

    return isActive;
}

export function useReducedMotionPreference(): boolean {
    const [reducedMotionPreferred, setReducedMotionPreferred] =
        React.useState(false);

    React.useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
            if (mounted) {
                setReducedMotionPreferred(enabled);
            }
        });
        const subscription = AccessibilityInfo.addEventListener(
            "reduceMotionChanged",
            setReducedMotionPreferred,
        );
        return () => {
            mounted = false;
            subscription.remove();
        };
    }, []);

    return reducedMotionPreferred;
}

export const useNotificationsPermissions =
    (): UseQueryResult<PermissionsStatus> =>
        useQuery({
            queryKey: [QUERYKEY_NOTIFICATIONS_PERMISSIONS],
            queryFn: async () => {
                const permissions = await Notifications.getPermissionsAsync();
                let permissionStatus: string;
                if (!permissions.granted && permissions.canAskAgain) {
                    permissionStatus = "NOT_GRANTED_CAN_ASK";
                } else if (!permissions.granted && !permissions.canAskAgain) {
                    permissionStatus = "NOT_GRANTED_CANT_ASK";
                } else {
                    permissionStatus = "GRANTED";
                }
                return PermissionsStatusSchema.parse(permissionStatus);
            },
            refetchInterval: 2000,
        });

export const useAndroidPersonalCompartmentId =
    (): UseQueryResult<PersonalCompartmentId | null> =>
        useQuery({
            queryKey: [QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID],
            staleTime: Infinity,
            gcTime: Infinity,
            enabled: Platform.OS === "android",
            queryFn: async () => loadAndroidPersonalCompartmentId(),
        });

export const useConduitName = (): UseQueryResult<string> => {
    return useQuery({
        queryKey: [QUERYKEY_CONDUIT_NAME],
        queryFn: async () => loadCachedAlias(),
    });
};

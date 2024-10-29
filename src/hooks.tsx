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
import * as SecureStore from "expo-secure-store";
import { z } from "zod";

import {
    QUERYKEY_CONDUIT_NAME,
    QUERYKEY_NOTIFICATIONS_PERMISSIONS,
    SECURESTORE_CONDUIT_NAME_KEY,
} from "@/src/constants";

const PermissionsStatusSchema = z.enum([
    "GRANTED",
    "NOT_GRANTED_CAN_ASK",
    "NOT_GRANTED_CANT_ASK",
]);
type PermissionsStatus = z.infer<typeof PermissionsStatusSchema>;

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

export const useConduitName = (): UseQueryResult<string> =>
    useQuery({
        queryKey: [QUERYKEY_CONDUIT_NAME],
        queryFn: async () => {
            const storedConduitName = await SecureStore.getItemAsync(
                SECURESTORE_CONDUIT_NAME_KEY,
            );
            if (storedConduitName == null) {
                return "";
            } else {
                return storedConduitName;
            }
        },
    });

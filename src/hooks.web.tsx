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
import React from "react";
import { z } from "zod";

import { loadCachedAlias } from "@/src/common/conduitAlias";
import {
    QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID,
    QUERYKEY_CONDUIT_NAME,
    QUERYKEY_NOTIFICATIONS_PERMISSIONS,
} from "@/src/constants";
import { PersonalCompartmentId } from "@/src/pairing/compartmentId";

const PermissionsStatusSchema = z.enum([
    "GRANTED",
    "NOT_GRANTED_CAN_ASK",
    "NOT_GRANTED_CANT_ASK",
]);
type PermissionsStatus = z.infer<typeof PermissionsStatusSchema>;

function documentIsActive(): boolean {
    return (
        typeof document === "undefined" ||
        document.visibilityState === "visible"
    );
}

export function useAppIsActive(): boolean {
    const [isActive, setIsActive] = React.useState(documentIsActive);

    React.useEffect(() => {
        if (typeof document === "undefined") {
            return;
        }
        const handleVisibilityChange = () => setIsActive(documentIsActive());
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
        };
    }, []);

    return isActive;
}

function reducedMotionIsPreferred(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
}

export function useReducedMotionPreference(): boolean {
    const [reducedMotionPreferred, setReducedMotionPreferred] = React.useState(
        reducedMotionIsPreferred,
    );

    React.useEffect(() => {
        if (
            typeof window === "undefined" ||
            typeof window.matchMedia !== "function"
        ) {
            return;
        }
        const mediaQuery = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        );
        const handleChange = (event: MediaQueryListEvent) => {
            setReducedMotionPreferred(event.matches);
        };
        setReducedMotionPreferred(mediaQuery.matches);
        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, []);

    return reducedMotionPreferred;
}

export const useNotificationsPermissions =
    (): UseQueryResult<PermissionsStatus> =>
        useQuery({
            queryKey: [QUERYKEY_NOTIFICATIONS_PERMISSIONS],
            queryFn: async () =>
                PermissionsStatusSchema.parse("NOT_GRANTED_CANT_ASK"),
            staleTime: Infinity,
        });

export const useAndroidPersonalCompartmentId =
    (): UseQueryResult<PersonalCompartmentId | null> =>
        useQuery({
            queryKey: [QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID],
            staleTime: Infinity,
            gcTime: Infinity,
            queryFn: async () => null,
        });

export const useConduitName = (): UseQueryResult<string> => {
    return useQuery({
        queryKey: [QUERYKEY_CONDUIT_NAME],
        queryFn: async () => loadCachedAlias(),
    });
};

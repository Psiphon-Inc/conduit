import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    UseMutationResult,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import React from "react";

import { handleError, wrapError } from "@/src/common/errors";

export interface NotificationsContextValue {
    permissionStatus: Notifications.PermissionStatus | null;
    canAskAgain: boolean | null;
    warningDismissed: boolean | null;
    useDismissNotificationsWarning: () => UseMutationResult<
        void,
        Error,
        void,
        unknown
    >;
}

export const NotificationsContext =
    React.createContext<NotificationsContextValue | null>(null);

export function useNotificationsContext(): NotificationsContextValue {
    const value = React.useContext(NotificationsContext);
    if (!value) {
        throw new Error(
            "useNotificationsContext must be used within a NotificationsProvider",
        );
    }
    return value;
}

export function NotificationsProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [permissionStatus, setPermissionStatus] =
        React.useState<Notifications.PermissionStatus | null>(null);
    const [canAskAgain, setCanAskAgain] = React.useState<boolean | null>(null);
    const [warningDismissed, setWarningDismissed] = React.useState<
        boolean | null
    >(null);

    const queryClient = useQueryClient();

    const warningDismissedStorageKey = "NotificationsWarningsDismissed";

    async function syncPermissionState() {
        const response = await Notifications.getPermissionsAsync();
        setPermissionStatus(response.status);
        setCanAskAgain(response.canAskAgain);

        try {
            const storedWarningDismissed = await AsyncStorage.getItem(
                warningDismissedStorageKey,
            );
            if (storedWarningDismissed === null) {
                setWarningDismissed(false);
            }
            if (storedWarningDismissed === "dismissed") {
                setWarningDismissed(true);
            }
        } catch (error) {
            handleError(
                wrapError(
                    error,
                    "Failed to sync no-notifications warning dismissal state",
                ),
            );
        }

        return response;
    }

    async function dismissWarning() {
        try {
            await AsyncStorage.setItem(warningDismissedStorageKey, "dismissed");
        } catch (error) {
            handleError(
                wrapError(
                    error,
                    "Failed to store no-notifications warning dismissal",
                ),
            );
        }
        setWarningDismissed(true);
    }

    const useNotificationsPermission = () =>
        useQuery({
            queryKey: ["notifications-permission"],
            queryFn: syncPermissionState,
            // only refetch permission status if permission is not granted
            refetchInterval: permissionStatus === "granted" ? false : 2000,
        });

    const useDismissNotificationsWarning = () =>
        useMutation({
            mutationFn: dismissWarning,
            onSuccess: () => {
                queryClient.invalidateQueries({
                    queryKey: ["notifications-permission"],
                });
            },
        });

    // continually sync notification permissions status
    useNotificationsPermission();

    const value = {
        permissionStatus: permissionStatus,
        canAskAgain: canAskAgain,
        warningDismissed: warningDismissed,
        useDismissNotificationsWarning: useDismissNotificationsWarning,
    };
    return (
        <NotificationsContext.Provider value={value}>
            {children}
        </NotificationsContext.Provider>
    );
}

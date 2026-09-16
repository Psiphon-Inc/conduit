import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";

import { QUERYKEY_HOSTED_PROMOTION } from "@/src/constants";
import { useAppIsActive } from "@/src/hooks";
import {
    HOSTED_PROMOTION_COOLDOWN_MS,
    type HostedPromotionPreference,
    type HostedPromotionStorage,
    loadHostedPromotionPreference,
    parseHostedPromotionDismissal,
    saveHostedPromotionDismissal,
} from "@/src/hosted-promotion/hostedPromotionPreference";

const queryKey = [QUERYKEY_HOSTED_PROMOTION];
const MAX_REFRESH_DELAY_MS = 24 * 60 * 60 * 1000;

interface HostedPromotionValue {
    readonly visible: boolean;
    readonly dismiss: () => void;
}

// Optional promos are hidden outside composition as well as during hydration.
const HostedPromotionContext = React.createContext<HostedPromotionValue>({
    visible: false,
    dismiss: () => {},
});

/** Owns one shared cooldown, hydration, ordered writes and expiry observer for every placement. */
export function HostedPromotionProvider({
    children,
    storage = AsyncStorage,
    now = Date.now,
}: {
    children: React.ReactNode;
    storage?: HostedPromotionStorage;
    now?: () => number;
}): React.ReactNode {
    const client = useQueryClient();
    const active = useAppIsActive();
    const preference = useQuery({
        queryKey,
        queryFn: () => loadHostedPromotionPreference(storage, now),
        staleTime: Infinity,
        gcTime: Infinity,
        networkMode: "always",
    });
    const [currentTime, setCurrentTime] = React.useState(now);
    const writes = React.useRef(Promise.resolve());
    const dismissedAt =
        preference.data?.status === "ready"
            ? preference.data.dismissedAt
            : null;

    React.useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const refresh = () => {
            const time = now();
            setCurrentTime(time);
            if (dismissedAt === null) return;
            const remaining = dismissedAt + HOSTED_PROMOTION_COOLDOWN_MS - time;
            if (remaining > 0)
                timer = setTimeout(
                    refresh,
                    Math.min(remaining, MAX_REFRESH_DELAY_MS),
                );
        };
        refresh();
        return () => clearTimeout(timer);
    }, [dismissedAt, active, now]);

    const dismiss = React.useCallback(() => {
        const time = now();
        const timestamp = parseHostedPromotionDismissal(String(time), time);
        // Date.now() is a safe epoch millisecond integer. Keep a broken injected
        // clock from writing malformed data; it is not a recoverable storage error.
        if (timestamp === null)
            throw new Error(
                "Hosted promotion clock returned invalid epoch milliseconds",
            );
        void client.cancelQueries({ queryKey });
        client.setQueryData(
            queryKey,
            (): HostedPromotionPreference => ({
                status: "ready",
                dismissedAt: timestamp,
            }),
        );
        setCurrentTime(time);
        writes.current = writes.current.then(async () => {
            await saveHostedPromotionDismissal(timestamp, storage);
        });
    }, [client, storage, now]);

    const visible =
        preference.data?.status === "ready" &&
        (dismissedAt === null ||
            currentTime >= dismissedAt + HOSTED_PROMOTION_COOLDOWN_MS);
    const value = React.useMemo(
        () => ({ visible, dismiss }),
        [visible, dismiss],
    );
    return (
        <HostedPromotionContext.Provider value={value}>
            {children}
        </HostedPromotionContext.Provider>
    );
}

/** Optional placements share visibility; this must not gate intentional setup or purchase actions. */
export function useHostedPromotion(): HostedPromotionValue {
    return React.useContext(HostedPromotionContext);
}

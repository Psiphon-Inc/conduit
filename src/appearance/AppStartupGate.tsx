import React from "react";

import { useAppAppearance } from "@/src/appearance/AppAppearance";

/** Reveals the app once fonts and skin are ready, with the existing 2s startup deadline. */
export function AppStartupGate({
    assetsReady,
    onReady,
    children,
}: {
    assetsReady: boolean;
    onReady?: () => void;
    children: React.ReactNode;
}): React.ReactNode {
    const { hydrated } = useAppAppearance();
    const [ready, setReady] = React.useState(assetsReady && hydrated);
    const notified = React.useRef(false);

    React.useEffect(() => {
        if (assetsReady && hydrated) setReady(true);
    }, [assetsReady, hydrated]);

    React.useEffect(() => {
        if (ready) return;
        // Partial progress must not restart this deadline. Once released, later
        // cache invalidation or asset updates must not unmount the app again.
        const fallbackTimer = setTimeout(() => setReady(true), 2000);
        return () => clearTimeout(fallbackTimer);
    }, [ready]);

    React.useEffect(() => {
        if (!ready || notified.current) return;
        notified.current = true;
        // Runs after the ready tree commits, so native splash removal cannot
        // reveal a frame painted with the pending default skin.
        onReady?.();
    }, [ready, onReady]);

    return ready ? children : null;
}

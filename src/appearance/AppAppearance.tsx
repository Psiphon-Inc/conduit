import { useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";

import {
    APP_SKINS,
    type AppSkinId,
    type AppSkinTokens,
} from "@/src/appearance/appSkins";
import {
    type SkinPreferenceStorage,
    loadAppSkinPreference,
    saveAppSkinPreference,
} from "@/src/appearance/skinPreference";
import * as secureStorage from "@/src/common/secureStorage";
import { sharedStyles } from "@/src/styles";

const skinQueryKey = ["appSkin"];

interface AppAppearanceValue {
    readonly skin: AppSkinTokens;
    readonly loading: boolean;
    readonly persistence: "idle" | "saving" | "saved" | "unavailable";
    readonly selectSkin: (skinId: AppSkinId) => void;
}

// Static consumers/tests outside the app shell retain the original appearance.
const AppAppearanceContext = React.createContext<AppAppearanceValue>({
    skin: APP_SKINS.current,
    loading: false,
    persistence: "idle",
    selectSkin: () => {},
});

/** Owns preference hydration and ordered writes inside the app query provider. */
export function AppAppearanceProvider({
    children,
    storage = secureStorage,
}: {
    children: React.ReactNode;
    storage?: SkinPreferenceStorage;
}) {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: skinQueryKey,
        queryFn: () => loadAppSkinPreference(storage),
        staleTime: Infinity,
        gcTime: Infinity,
    });
    const [persistence, setPersistence] =
        React.useState<AppAppearanceValue["persistence"]>("idle");
    const writes = React.useRef(Promise.resolve());
    const selectionVersion = React.useRef(0);
    const selectSkin = React.useCallback(
        (skinId: AppSkinId) => {
            // Cancel hydration before publishing so a late read cannot undo a tap.
            void queryClient.cancelQueries({ queryKey: skinQueryKey });
            queryClient.setQueryData(skinQueryKey, skinId);
            setPersistence("saving");
            const version = ++selectionVersion.current;
            writes.current = writes.current.then(async () => {
                const result = await saveAppSkinPreference(skinId, storage);
                if (selectionVersion.current === version) {
                    setPersistence(result.status);
                }
            });
        },
        [queryClient, storage],
    );
    const value = React.useMemo<AppAppearanceValue>(
        () => ({
            skin: APP_SKINS[query.data ?? "current"],
            loading: query.isPending,
            persistence,
            selectSkin,
        }),
        [query.data, query.isPending, persistence, selectSkin],
    );
    return (
        <AppAppearanceContext.Provider value={value}>
            {children}
        </AppAppearanceContext.Provider>
    );
}

/** Supplies active skin paint and the immediate, persisted selection action. */
export function useAppAppearance(): AppAppearanceValue {
    return React.useContext(AppAppearanceContext);
}

/** Overrides visual lab paint without reading or writing the saved preference. */
export function AppSkinPreview({
    skinId,
    children,
}: {
    skinId: AppSkinId;
    children: React.ReactNode;
}) {
    const value = React.useMemo<AppAppearanceValue>(
        () => ({
            skin: APP_SKINS[skinId],
            loading: false,
            persistence: "idle",
            selectSkin: () => {},
        }),
        [skinId],
    );
    return (
        <AppAppearanceContext.Provider value={value}>
            {children}
        </AppAppearanceContext.Provider>
    );
}

/** Preserves shared layout styles while making their text/surface roles skin-aware. */
export function useAppearanceStyles(): typeof sharedStyles {
    const { skin } = useAppAppearance();
    return React.useMemo(
        () =>
            skin.id === "current"
                ? sharedStyles
                : {
                      ...sharedStyles,
                      blackText: { color: skin.text },
                      greyText: { color: skin.mutedText },
                      purpleText: { color: skin.accent },
                      whiteBg: { backgroundColor: skin.surface },
                      greyBorderBottom: {
                          ...sharedStyles.greyBorderBottom,
                          borderColor: skin.border,
                      },
                      greyBorderTop: {
                          ...sharedStyles.greyBorderTop,
                          borderColor: skin.border,
                      },
                      purpleBorder: {
                          ...sharedStyles.purpleBorder,
                          borderColor: skin.accent,
                      },
                  },
        [skin],
    );
}

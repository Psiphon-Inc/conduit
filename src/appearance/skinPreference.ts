import AsyncStorage from "@react-native-async-storage/async-storage";

import {
    type AppSkinId,
    parseAppSkinPreference,
} from "@/src/appearance/appSkins";
import {
    AppAppearanceError,
    reportAppearanceFailure,
} from "@/src/appearance/appearanceErrors";
import { ASYNCSTORAGE_APP_SKIN_KEY } from "@/src/constants";

/** Persistence failures do not prevent a usable in-session skin selection. */
export type SkinPersistenceResult =
    | { readonly status: "saved" }
    | { readonly status: "unavailable"; readonly error: AppAppearanceError };

/** Failed reads still yield a usable default and retain the failure for diagnostics. */
export type SkinPreferenceReadResult =
    | { readonly status: "loaded"; readonly skinId: AppSkinId }
    | {
          readonly status: "unavailable";
          readonly skinId: "current";
          readonly error: AppAppearanceError;
      };

/** Minimal cross-platform storage capability for the non-secret skin preference. */
export interface SkinPreferenceStorage {
    readonly getItem: (key: string) => Promise<string | null>;
    readonly setItem: (key: string, value: string) => Promise<void>;
}

/** Read the non-secret skin preference, decoding old or invalid storage safely. */
export async function loadAppSkinPreference(
    storage: SkinPreferenceStorage = AsyncStorage,
): Promise<SkinPreferenceReadResult> {
    try {
        return {
            status: "loaded",
            skinId: parseAppSkinPreference(
                await storage.getItem(ASYNCSTORAGE_APP_SKIN_KEY),
            ),
        };
    } catch (cause) {
        return {
            status: "unavailable",
            skinId: "current",
            error: reportAppearanceFailure("read-preference", cause),
        };
    }
}

/** Save one skin choice; callers serialize writes to preserve selection order. */
export async function saveAppSkinPreference(
    skinId: AppSkinId,
    storage: SkinPreferenceStorage = AsyncStorage,
): Promise<SkinPersistenceResult> {
    try {
        await storage.setItem(ASYNCSTORAGE_APP_SKIN_KEY, skinId);
        return { status: "saved" };
    } catch (cause) {
        return {
            status: "unavailable",
            error: reportAppearanceFailure("write-preference", cause),
        };
    }
}

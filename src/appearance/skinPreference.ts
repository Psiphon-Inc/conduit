import {
    type AppSkinId,
    parseAppSkinPreference,
} from "@/src/appearance/appSkins";
import * as secureStorage from "@/src/common/secureStorage";
import { SECURESTORE_APP_SKIN_KEY } from "@/src/constants";

/** Persistence failures do not prevent a usable in-session skin selection. */
export type SkinPersistenceResult =
    | { readonly status: "saved" }
    | { readonly status: "unavailable" };

/** Minimal cross-platform storage capability for the non-secret skin preference. */
export interface SkinPreferenceStorage {
    readonly getItemAsync: (key: string) => Promise<string | null>;
    readonly setItemAsync: (key: string, value: string) => Promise<void>;
}

/** Read the non-secret skin preference, decoding old or invalid storage safely. */
export async function loadAppSkinPreference(
    storage: SkinPreferenceStorage = secureStorage,
): Promise<AppSkinId> {
    try {
        return parseAppSkinPreference(
            await storage.getItemAsync(SECURESTORE_APP_SKIN_KEY),
        );
    } catch {
        return "current";
    }
}

/** Save one skin choice; callers serialize writes to preserve selection order. */
export async function saveAppSkinPreference(
    skinId: AppSkinId,
    storage: SkinPreferenceStorage = secureStorage,
): Promise<SkinPersistenceResult> {
    try {
        await storage.setItemAsync(SECURESTORE_APP_SKIN_KEY, skinId);
        return { status: "saved" };
    } catch {
        return { status: "unavailable" };
    }
}

import {
    SECURESTORE_CONDUIT_NAME_KEY,
    SECURESTORE_HOSTED_LAST_AUTH_PROVIDER_KEY,
} from "@/src/constants";

const memoryStorage = new Map<string, string>();

// Web has no SecureStore equivalent. Keep auth/session tokens out of
// localStorage by default; only non-secret UX hints survive browser restarts.
const localStorageKeys = new Set([
    SECURESTORE_CONDUIT_NAME_KEY,
    SECURESTORE_HOSTED_LAST_AUTH_PROVIDER_KEY,
]);

function getStorage(): Storage | null {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

function getLocalStorage(): Storage | null {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function getPersistentStorageForKey(key: string): Storage | null {
    return localStorageKeys.has(key) ? getLocalStorage() : getStorage();
}

function clearLocalStorageForSensitiveKey(key: string): void {
    if (localStorageKeys.has(key)) {
        return;
    }

    getLocalStorage()?.removeItem(key);
}

export async function getItemAsync(key: string): Promise<string | null> {
    clearLocalStorageForSensitiveKey(key);
    return (
        getPersistentStorageForKey(key)?.getItem(key) ??
        memoryStorage.get(key) ??
        null
    );
}

export async function setItemAsync(key: string, value: string): Promise<void> {
    clearLocalStorageForSensitiveKey(key);
    memoryStorage.set(key, value);
    getPersistentStorageForKey(key)?.setItem(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
    memoryStorage.delete(key);
    getStorage()?.removeItem(key);
    getLocalStorage()?.removeItem(key);
}

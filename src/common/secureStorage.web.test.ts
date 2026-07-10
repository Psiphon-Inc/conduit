import * as secureStorage from "@/src/common/secureStorage.web";
import {
    SECURESTORE_CONDUIT_NAME_KEY,
    SECURESTORE_HOSTED_SESSION_KEY,
} from "@/src/constants";

describe("secureStorage.web", () => {
    beforeEach(() => {
        installStorageMock();
    });

    it("stores sensitive values in session storage only", async () => {
        const key = `${SECURESTORE_HOSTED_SESSION_KEY}.test`;

        window.localStorage.setItem(key, "legacy-token");
        await secureStorage.setItemAsync(key, "session-token");

        expect(window.sessionStorage.getItem(key)).toBe("session-token");
        expect(window.localStorage.getItem(key)).toBeNull();
        await expect(secureStorage.getItemAsync(key)).resolves.toBe(
            "session-token",
        );
    });

    it("allows non-secret preferences to persist in local storage", async () => {
        await secureStorage.setItemAsync(SECURESTORE_CONDUIT_NAME_KEY, "Alice");

        expect(window.localStorage.getItem(SECURESTORE_CONDUIT_NAME_KEY)).toBe(
            "Alice",
        );
        expect(
            window.sessionStorage.getItem(SECURESTORE_CONDUIT_NAME_KEY),
        ).toBeNull();
    });
});

function installStorageMock(): void {
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            localStorage: createStorageMock(),
            sessionStorage: createStorageMock(),
        },
    });
}

function createStorageMock(): Storage {
    const values = new Map<string, string>();
    return {
        get length() {
            return values.size;
        },
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        key: (index: number) => [...values.keys()][index] ?? null,
        removeItem: (key: string) => {
            values.delete(key);
        },
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
    };
}

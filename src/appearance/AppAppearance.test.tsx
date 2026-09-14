import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Text } from "react-native";
import { type ReactTestRenderer, act, create } from "react-test-renderer";

import {
    AppAppearanceProvider,
    useAppAppearance,
} from "@/src/appearance/AppAppearance";
import { SkinPicker } from "@/src/appearance/SkinPicker";
import {
    type SkinPreferenceStorage,
    loadAppSkinPreference,
    saveAppSkinPreference,
} from "@/src/appearance/skinPreference";
import { getOrbSceneTheme } from "@/src/components/orb-scene/orbSceneTheme";
import { ASYNCSTORAGE_APP_SKIN_KEY } from "@/src/constants";
import i18nService from "@/src/i18n/i18n";

class MemorySkinStorage implements SkinPreferenceStorage {
    readonly values = new Map<string, string>();
    async getItem(key: string): Promise<string | null> {
        return this.values.get(key) ?? null;
    }
    async setItem(key: string, value: string): Promise<void> {
        this.values.set(key, value);
    }
}

function RendererPaintProbe() {
    const { skin } = useAppAppearance();
    const theme = getOrbSceneTheme(skin.id, 1);
    return (
        <Text testID="renderer-paint" style={{ color: theme.hintColor }}>
            {skin.id}
        </Text>
    );
}

async function mountAppearance(storage: SkinPreferenceStorage) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
        renderer = create(
            <QueryClientProvider client={client}>
                <AppAppearanceProvider storage={storage}>
                    <SkinPicker />
                    <RendererPaintProbe />
                </AppAppearanceProvider>
            </QueryClientProvider>,
        );
    });
    if (!renderer) throw new Error("Appearance test renderer did not mount");
    return { renderer, client };
}

async function settleQueryUpdates() {
    await act(async () => {
        await jest.runOnlyPendingTimersAsync();
    });
}

beforeAll(() => i18nService.initI18n());
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("Settings skin radio selection updates renderer paint and survives a new query client", async () => {
    const storage = new MemorySkinStorage();
    const first = await mountAppearance(storage);
    await settleQueryUpdates();
    expect(
        first.renderer.root.findByProps({ testID: "skin-current" }).props
            .accessibilityState.checked,
    ).toBe(true);
    await act(async () => {
        first.renderer.root
            .findByProps({ testID: "skin-classic-dark" })
            .props.onPress();
    });
    await settleQueryUpdates();
    expect(
        first.renderer.root.findByProps({ testID: "skin-classic-dark" }).props
            .accessibilityState.checked,
    ).toBe(true);
    expect(
        first.renderer.root.findByProps({ testID: "renderer-paint" }).props
            .style.color,
    ).toBe("#E0E0E0");
    expect(storage.values.get(ASYNCSTORAGE_APP_SKIN_KEY)).toBe("classic-dark");
    await act(async () => first.renderer.unmount());
    first.client.clear();
    const restarted = await mountAppearance(storage);
    await settleQueryUpdates();
    expect(
        restarted.renderer.root.findByProps({ testID: "skin-classic-dark" })
            .props.accessibilityState.checked,
    ).toBe(true);
    await act(async () =>
        restarted.renderer.root
            .findByProps({ testID: "skin-current" })
            .props.onPress(),
    );
    await settleQueryUpdates();
    expect(
        restarted.renderer.root.findByProps({ testID: "renderer-paint" }).props
            .style.color,
    ).toBe("#231F20");
    expect(await loadAppSkinPreference(storage)).toEqual({
        status: "loaded",
        skinId: "current",
    });
    await act(async () => restarted.renderer.unmount());
    restarted.client.clear();
});

test("a late hydration read cannot overwrite a selection; rapid writes preserve tap order", async () => {
    let finishRead: (value: string) => void = () => {};
    let finishWrite: () => void = () => {};
    const values = new Map<string, string>();
    let writes = 0;
    const storage: SkinPreferenceStorage = {
        getItem: () =>
            new Promise((resolve) => {
                finishRead = resolve;
            }),
        setItem: async (key, value) => {
            if (++writes === 1)
                await new Promise<void>((resolve) => {
                    finishWrite = resolve;
                });
            values.set(key, value);
        },
    };
    const { renderer, client } = await mountAppearance(storage);
    await act(async () =>
        renderer.root
            .findByProps({ testID: "skin-classic-dark" })
            .props.onPress(),
    );
    await settleQueryUpdates();
    // The first write is still pending, but paint already changed.
    expect(
        renderer.root.findByProps({ testID: "renderer-paint" }).props.children,
    ).toBe("classic-dark");
    await act(async () => finishRead("current"));
    await settleQueryUpdates();
    expect(
        renderer.root.findByProps({ testID: "renderer-paint" }).props.children,
    ).toBe("classic-dark");
    await act(async () =>
        renderer.root.findByProps({ testID: "skin-current" }).props.onPress(),
    );
    await act(async () => finishWrite());
    await settleQueryUpdates();
    expect(values.get(ASYNCSTORAGE_APP_SKIN_KEY)).toBe("current");
    expect(
        renderer.root.findByProps({ testID: "renderer-paint" }).props.children,
    ).toBe("current");
    await act(async () => renderer.unmount());
    client.clear();
});

test("storage failure keeps selected paint usable and exposes a retryable warning", async () => {
    const cause = new Error("Storage unavailable");
    const storage: SkinPreferenceStorage = {
        getItem: async () => {
            throw cause;
        },
        setItem: async () => {
            throw cause;
        },
    };
    const readResult = await loadAppSkinPreference(storage);
    expect(readResult.skinId).toBe("current");
    expect(readResult.status).toBe("unavailable");
    if (readResult.status === "unavailable")
        expect(readResult.error.cause).toBe(cause);
    const writeResult = await saveAppSkinPreference("classic-dark", storage);
    expect(writeResult.status).toBe("unavailable");
    if (writeResult.status === "unavailable")
        expect(writeResult.error.cause).toBe(cause);
    const { renderer, client } = await mountAppearance(storage);
    await settleQueryUpdates();
    await act(async () =>
        renderer.root
            .findByProps({ testID: "skin-classic-dark" })
            .props.onPress(),
    );
    await settleQueryUpdates();
    expect(
        renderer.root.findByProps({ testID: "renderer-paint" }).props.children,
    ).toBe("classic-dark");
    expect(
        renderer.root.findAllByProps({ accessibilityRole: "alert" }).length,
    ).toBeGreaterThan(0);
    await act(async () => renderer.unmount());
    client.clear();
});

test.each([
    null,
    "",
    "light",
    "CLASSIC-DARK",
    '"classic-dark"',
    '{"id":"classic-dark"}',
    "__proto__",
    "future-skin",
])(
    "stored invalid skin %p falls back without deleting other preferences",
    async (stored) => {
        const storage = new MemorySkinStorage();
        storage.values.set("unrelated", "keep");
        if (stored !== null)
            storage.values.set(ASYNCSTORAGE_APP_SKIN_KEY, stored);
        expect(await loadAppSkinPreference(storage)).toEqual({
            status: "loaded",
            skinId: "current",
        });
        expect(storage.values.get("unrelated")).toBe("keep");
    },
);

test("default adapter uses the app's AsyncStorage preference convention", async () => {
    await AsyncStorage.removeItem(ASYNCSTORAGE_APP_SKIN_KEY);
    expect(await saveAppSkinPreference("classic-dark")).toEqual({
        status: "saved",
    });
    expect(await AsyncStorage.getItem(ASYNCSTORAGE_APP_SKIN_KEY)).toBe(
        "classic-dark",
    );
    expect(await loadAppSkinPreference()).toEqual({
        status: "loaded",
        skinId: "classic-dark",
    });
    await AsyncStorage.setItem(ASYNCSTORAGE_APP_SKIN_KEY, '"classic-dark"');
    expect(await loadAppSkinPreference()).toEqual({
        status: "loaded",
        skinId: "current",
    });
    await AsyncStorage.removeItem(ASYNCSTORAGE_APP_SKIN_KEY);
});

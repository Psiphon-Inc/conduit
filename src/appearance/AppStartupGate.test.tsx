import {
    QueryClient,
    QueryClientProvider,
    onlineManager,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { Text } from "react-native";
import { type ReactTestRenderer, act, create } from "react-test-renderer";

import {
    AppAppearanceProvider,
    useAppAppearance,
} from "@/src/appearance/AppAppearance";
import { AppStartupGate } from "@/src/appearance/AppStartupGate";
import type { SkinPreferenceStorage } from "@/src/appearance/skinPreference";

function FirstPaintProbe({ events }: { events: string[] }) {
    const { skin } = useAppAppearance();
    useEffect(() => {
        events.push(`paint:${skin.id}`);
    }, [events, skin.id]);
    return <Text testID="startup-paint">{skin.id}</Text>;
}

const mounted: { renderer: ReactTestRenderer; client: QueryClient }[] = [];

async function mountStartup(
    storage: SkinPreferenceStorage,
    assetsReady: boolean,
) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const events: string[] = [];
    const hideSplash = () => {
        events.push("splash:hidden");
    };
    const tree = (ready: boolean) => (
        <QueryClientProvider client={client}>
            <AppAppearanceProvider storage={storage}>
                <AppStartupGate assetsReady={ready} onReady={hideSplash}>
                    <FirstPaintProbe events={events} />
                </AppStartupGate>
            </AppAppearanceProvider>
        </QueryClientProvider>
    );
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
        renderer = create(tree(assetsReady));
    });
    if (!renderer) throw new Error("Startup test renderer did not mount");
    const mountedRenderer = renderer;
    mounted.push({ renderer, client });
    return {
        renderer,
        events,
        updateAssets: (ready: boolean) => mountedRenderer.update(tree(ready)),
    };
}

async function advanceStartupTime(milliseconds: number) {
    await act(async () => {
        await jest.advanceTimersByTimeAsync(milliseconds);
    });
}

beforeEach(() => jest.useFakeTimers());
afterEach(async () => {
    await act(async () => {
        for (const { renderer, client } of mounted.splice(0)) {
            renderer.unmount();
            client.clear();
        }
    });
    jest.useRealTimers();
});

test("cold start waits for stored Classic Dark and commits its first frame before hiding the splash", async () => {
    let finishRead: (value: string) => void = () => {};
    const startup = await mountStartup(
        {
            getItem: () =>
                new Promise((resolve) => {
                    finishRead = resolve;
                }),
            setItem: async () => {},
        },
        true,
    );
    await advanceStartupTime(1200);
    expect(
        startup.renderer.root.findAllByProps({ testID: "startup-paint" }),
    ).toHaveLength(0);
    expect(startup.events).toEqual([]);
    await act(async () => finishRead("classic-dark"));
    await advanceStartupTime(0);
    expect(startup.events).toEqual(["paint:classic-dark", "splash:hidden"]);
});

test("hydration alone does not release startup while fonts are pending, and release is latched", async () => {
    const startup = await mountStartup(
        { getItem: async () => "classic-dark", setItem: async () => {} },
        false,
    );
    await advanceStartupTime(1500);
    expect(startup.events).toEqual([]);
    await act(async () => startup.updateAssets(true));
    expect(startup.events).toEqual(["paint:classic-dark", "splash:hidden"]);
    await act(async () => startup.updateAssets(false));
    await advanceStartupTime(3000);
    expect(
        startup.renderer.root.findByProps({ testID: "startup-paint" }).props
            .children,
    ).toBe("classic-dark");
    expect(startup.events).toEqual(["paint:classic-dark", "splash:hidden"]);
});

test("failed storage hydration releases the default skin without waiting for the deadline", async () => {
    const startup = await mountStartup(
        {
            getItem: async () => {
                throw new Error("Storage unavailable");
            },
            setItem: async () => {},
        },
        true,
    );
    await advanceStartupTime(0);
    expect(startup.events).toEqual(["paint:current", "splash:hidden"]);
});

test("a stalled read cannot hold the splash forever, and partial progress never restarts the two-second deadline", async () => {
    let finishRead: (value: string) => void = () => {};
    const startup = await mountStartup(
        {
            getItem: () =>
                new Promise((resolve) => {
                    finishRead = resolve;
                }),
            setItem: async () => {},
        },
        false,
    );
    await advanceStartupTime(1500);
    await act(async () => startup.updateAssets(true));
    await advanceStartupTime(499);
    expect(startup.events).toEqual([]);
    await advanceStartupTime(1);
    expect(startup.events).toEqual(["paint:current", "splash:hidden"]);
    await act(async () => finishRead("classic-dark"));
    await advanceStartupTime(0);
    expect(startup.events).toEqual([
        "paint:current",
        "splash:hidden",
        "paint:classic-dark",
    ]);
});

test("local skin hydration remains available during offline cold start", async () => {
    onlineManager.setOnline(false);
    try {
        const startup = await mountStartup(
            { getItem: async () => "classic-dark", setItem: async () => {} },
            true,
        );
        await advanceStartupTime(0);
        expect(startup.events).toEqual(["paint:classic-dark", "splash:hidden"]);
    } finally {
        onlineManager.setOnline(true);
    }
});

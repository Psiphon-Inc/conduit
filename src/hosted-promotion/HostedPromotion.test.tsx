import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Pressable, Text } from "react-native";
import { type ReactTestRenderer, act, create } from "react-test-renderer";

import { ASYNCSTORAGE_HOSTED_PROMOTION_DISMISSED_AT_KEY } from "@/src/constants";
import {
    HostedPromotionProvider,
    useHostedPromotion,
} from "@/src/hosted-promotion/HostedPromotion";
import {
    HOSTED_PROMOTION_COOLDOWN_MS,
    type HostedPromotionStorage,
    loadHostedPromotionPreference,
    parseHostedPromotionDismissal,
    saveHostedPromotionDismissal,
} from "@/src/hosted-promotion/hostedPromotionPreference";

const START = Date.UTC(2026, 8, 14);
const KEY = ASYNCSTORAGE_HOSTED_PROMOTION_DISMISSED_AT_KEY;

class MemoryPromotionStorage implements HostedPromotionStorage {
    readonly values = new Map<string, string>();
    async getItem(key: string): Promise<string | null> {
        return this.values.get(key) ?? null;
    }
    async setItem(key: string, value: string): Promise<void> {
        this.values.set(key, value);
    }
}

function PromotionProbe({ placement }: { placement: string }) {
    const { visible, dismiss } = useHostedPromotion();
    return (
        <>
            <Text testID={`${placement}-visible`}>{String(visible)}</Text>
            <Pressable testID={`${placement}-dismiss`} onPress={dismiss} />
        </>
    );
}

const mounts: { renderer: ReactTestRenderer; client: QueryClient }[] = [];
async function mountPromotion(storage: HostedPromotionStorage) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
        renderer = create(
            <QueryClientProvider client={client}>
                <HostedPromotionProvider storage={storage}>
                    <PromotionProbe placement="home" />
                    <PromotionProbe placement="hosted" />
                </HostedPromotionProvider>
            </QueryClientProvider>,
        );
    });
    if (!renderer)
        throw new Error("Hosted promotion test renderer did not mount");
    mounts.push({ renderer, client });
    return renderer;
}
async function flush() {
    await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
    });
}
function expectVisible(renderer: ReactTestRenderer, visible: boolean) {
    for (const placement of ["home", "hosted"])
        expect(
            renderer.root.findByProps({ testID: `${placement}-visible` }).props
                .children,
        ).toBe(String(visible));
}
async function dismiss(renderer: ReactTestRenderer, placement = "home") {
    await act(async () =>
        renderer.root
            .findByProps({ testID: `${placement}-dismiss` })
            .props.onPress(),
    );
    await flush();
}

beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(START);
});
afterEach(async () => {
    await act(async () => {
        for (const { renderer, client } of mounts.splice(0)) {
            renderer.unmount();
            client.clear();
        }
    });
    jest.useRealTimers();
});

test("pending hydration never flashes promotions; a stored dismissal suppresses both placements", async () => {
    let finish: (raw: string) => void = () => {};
    const renderer = await mountPromotion({
        getItem: () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
        setItem: async () => {},
    });
    expectVisible(renderer, false);
    await act(async () => finish(String(START - 1000)));
    await flush();
    expectVisible(renderer, false);
});

test("dismissal is shared and persisted, expires at exactly 60 days while mounted, and can be repeated", async () => {
    const storage = new MemoryPromotionStorage();
    const renderer = await mountPromotion(storage);
    await flush();
    expectVisible(renderer, true);
    await dismiss(renderer);
    expectVisible(renderer, false);
    expect(storage.values.get(KEY)).toBe(String(START));
    const restart = await mountPromotion(storage);
    await flush();
    expectVisible(restart, false);
    await act(async () => {
        await jest.advanceTimersByTimeAsync(HOSTED_PROMOTION_COOLDOWN_MS - 1);
    });
    expectVisible(renderer, false);
    await act(async () => {
        await jest.advanceTimersByTimeAsync(1);
    });
    expectVisible(renderer, true);
    await dismiss(renderer, "hosted");
    expectVisible(renderer, false);
    expect(storage.values.get(KEY)).toBe(
        String(START + HOSTED_PROMOTION_COOLDOWN_MS),
    );
});

test("late hydration cannot undo dismissal; ordered writes keep the latest timestamp", async () => {
    let finishRead: (raw: string | null) => void = () => {};
    let finishWrite: () => void = () => {};
    const writes: string[] = [];
    let first = true;
    const renderer = await mountPromotion({
        getItem: () =>
            new Promise((resolve) => {
                finishRead = resolve;
            }),
        setItem: async (_key, value) => {
            if (first) {
                first = false;
                await new Promise<void>((resolve) => {
                    finishWrite = resolve;
                });
            }
            writes.push(value);
        },
    });
    await dismiss(renderer);
    expectVisible(renderer, false);
    jest.setSystemTime(START + 1000);
    await dismiss(renderer, "hosted");
    await act(async () => {
        finishRead(null);
        finishWrite();
    });
    await flush();
    expectVisible(renderer, false);
    expect(writes).toEqual([String(START), String(START + 1000)]);
});

test.each([
    null,
    "",
    "NaN",
    "Infinity",
    "-1",
    "1.5",
    " 123",
    "1e3",
    "01",
    '"123"',
    '{"dismissedAt":123}',
    String(Number.MAX_SAFE_INTEGER + 1),
    String(START + 1),
])(
    "invalid timestamp %p does not suppress indefinitely or alter other preferences",
    async (raw) => {
        const storage = new MemoryPromotionStorage();
        storage.values.set("unrelated", "keep");
        if (raw !== null) storage.values.set(KEY, raw);
        expect(await loadHostedPromotionPreference(storage)).toEqual({
            status: "ready",
            dismissedAt: null,
        });
        const renderer = await mountPromotion(storage);
        await flush();
        expectVisible(renderer, true);
        expect(storage.values.get("unrelated")).toBe("keep");
        expect(storage.values.get(KEY)).toBe(raw ?? undefined);
    },
);

test("read failure suppresses optional promos and write failure preserves in-session dismissal and causes", async () => {
    const cause = new Error("private storage payload must not be logged");
    const failed: HostedPromotionStorage = {
        getItem: async () => {
            throw cause;
        },
        setItem: async () => {
            throw cause;
        },
    };
    const result = await loadHostedPromotionPreference(failed);
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") expect(result.error.cause).toBe(cause);
    const failedRead = await mountPromotion(failed);
    await flush();
    expectVisible(failedRead, false);
    const failedWrite = await mountPromotion({
        getItem: async () => null,
        setItem: failed.setItem,
    });
    await flush();
    expectVisible(failedWrite, true);
    await dismiss(failedWrite);
    expectVisible(failedWrite, false);
    const timestamp = parseHostedPromotionDismissal(String(START), START);
    if (timestamp === null) throw new Error("Test timestamp did not parse");
    const saved = await saveHostedPromotionDismissal(timestamp, failed);
    expect(saved.status).toBe("unavailable");
    if (saved.status === "unavailable") expect(saved.error.cause).toBe(cause);
});

test.each([0, START - HOSTED_PROMOTION_COOLDOWN_MS, START - 1, START])(
    "valid timestamp %p round-trips unchanged",
    async (value) => {
        const timestamp = parseHostedPromotionDismissal(String(value), START);
        if (timestamp === null) throw new Error("Test timestamp did not parse");
        const storage = new MemoryPromotionStorage();
        expect(await saveHostedPromotionDismissal(timestamp, storage)).toEqual({
            status: "saved",
        });
        expect(await loadHostedPromotionPreference(storage)).toEqual({
            status: "ready",
            dismissedAt: value,
        });
    },
);

test("preference diagnostics never log stored values or raw storage error messages", async () => {
    // Console is the existing observable diagnostics sink, not a mocked module.
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    const eventLog = jest.spyOn(console, "log").mockImplementation(() => {});
    const privateMessage = "private-storage-payload";
    try {
        await loadHostedPromotionPreference({
            getItem: async () => {
                throw new Error(privateMessage);
            },
            setItem: async () => {},
        });
        expect(errorLog).toHaveBeenCalledWith(
            "[client-event-error]",
            "hosted_promotion.preference_failed",
            {
                operation: "read",
                causeKind: "Error",
                message: "Hosted promotion preference read failed",
                error: {
                    name: "Error",
                    message: "Hosted promotion preference read failed",
                },
            },
        );
        expect(
            JSON.stringify([...errorLog.mock.calls, ...eventLog.mock.calls]),
        ).not.toContain(privateMessage);
    } finally {
        errorLog.mockRestore();
        eventLog.mockRestore();
    }
});

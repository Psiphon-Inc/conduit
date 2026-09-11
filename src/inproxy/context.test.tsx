import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { act, create } from "react-test-renderer";

import {
    ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY,
    QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID,
    QUERYKEY_INPROXY_KEYPAIR,
    SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
} from "@/src/constants";
import { InproxyProvider, useInproxyContext } from "@/src/inproxy/context";
import type { ConduitModuleAPI } from "@/src/inproxy/module";
import {
    type PairingConfiguration,
    useNativePairingConfiguration,
} from "@/src/inproxy/pairingConfiguration";
import type { InproxyEvent, InproxyParameters } from "@/src/inproxy/types";

it("discards a delayed identity load and superseded parameter writes before native dispatch", async () => {
    const platform = Platform.OS;
    Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: "android",
    });
    const localId = "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g";
    const reconciledId = "N8nN1DTLcuNj3DG39uUyIqBP+xKujq6IAklKO1f1Ftk";
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
        },
    });
    queryClient.setQueryData([QUERYKEY_INPROXY_KEYPAIR], {
        privateKey: new Uint8Array(32),
        publicKey: new Uint8Array(32),
    });
    queryClient.setQueryData(
        [QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID],
        localId,
    );
    const { nativeModule, dispatched } = recordingNativeDispatch();
    let inproxy: ReturnType<typeof useInproxyContext> | undefined;
    function Consumer() {
        inproxy = useInproxyContext();
        return null;
    }
    let releaseLoad: (value: string | null) => void = () => {};
    const delayedLoad = new Promise<string | null>((resolve) => {
        releaseLoad = resolve;
    });
    const getItem = jest
        .spyOn(AsyncStorage, "getItem")
        .mockReturnValueOnce(delayedLoad);
    let renderer: ReturnType<typeof create> | undefined;
    try {
        await act(async () => {
            renderer = create(
                <QueryClientProvider client={queryClient}>
                    <InproxyProvider module={nativeModule}>
                        <Consumer />
                    </InproxyProvider>
                </QueryClientProvider>,
            );
        });
        await act(async () => {
            queryClient.setQueryData(
                [QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID],
                reconciledId,
            );
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        await act(async () => {
            releaseLoad(null);
        });
        expect(
            dispatched.map((params) => params.personalCompartmentId),
        ).toEqual([reconciledId]);

        const params = dispatched[0];
        if (!params || !inproxy)
            throw new Error("Pairing test provider not ready");
        let releaseWrite: () => void = () => {};
        const delayedWrite = new Promise<void>((resolve) => {
            releaseWrite = resolve;
        });
        const setItem = jest
            .spyOn(AsyncStorage, "setItem")
            .mockImplementationOnce(async (key) => {
                expect(key).toBe(ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY);
                await delayedWrite;
            });
        try {
            const oldSelection = inproxy.selectInproxyParameters({
                ...params,
                personalCompartmentId: localId,
            });
            await Promise.resolve();
            const latestSelection = inproxy.selectInproxyParameters(params);
            await act(async () => {
                releaseWrite();
                await Promise.all([oldSelection, latestSelection]);
            });
            expect(
                dispatched.map((selected) => selected.personalCompartmentId),
            ).toEqual([reconciledId, reconciledId]);
        } finally {
            setItem.mockRestore();
        }
    } finally {
        getItem.mockRestore();
        await act(async () => {
            renderer?.unmount();
        });
        queryClient.clear();
        Object.defineProperty(Platform, "OS", {
            configurable: true,
            value: platform,
        });
    }
});

it("waits for SecureStore before deciding to generate a new pairing identity", async () => {
    const platform = Platform.OS;
    Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: "android",
    });
    const persistedId = "N8nN1DTLcuNj3DG39uUyIqBP+xKujq6IAklKO1f1Ftk";
    await SecureStore.setItemAsync(
        SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
        persistedId,
    );
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
        },
    });
    queryClient.setQueryData([QUERYKEY_INPROXY_KEYPAIR], {
        privateKey: new Uint8Array(32),
        publicKey: new Uint8Array(32),
    });
    let releaseRead: (id: string) => void = () => {};
    const read = jest.spyOn(SecureStore, "getItemAsync").mockReturnValueOnce(
        new Promise((resolve) => {
            releaseRead = resolve;
        }),
    );
    const { nativeModule, dispatched } = recordingNativeDispatch();
    let renderer: ReturnType<typeof create> | undefined;
    try {
        await act(async () => {
            renderer = create(
                <QueryClientProvider client={queryClient}>
                    <InproxyProvider module={nativeModule}>
                        {null}
                    </InproxyProvider>
                </QueryClientProvider>,
            );
        });
        expect(dispatched).toEqual([]);
        await expect(
            SecureStore.getItemAsync(
                SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
            ),
        ).resolves.toBe(persistedId);
        await act(async () => {
            releaseRead(persistedId);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        // Query notification and the subsequent async parameter load take separate turns.
        for (
            let attempt = 0;
            dispatched.length === 0 && attempt < 10;
            attempt++
        ) {
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
        }
        expect(
            dispatched.map((params) => params.personalCompartmentId),
        ).toEqual([persistedId]);
    } finally {
        read.mockRestore();
        await act(async () => {
            renderer?.unmount();
        });
        queryClient.clear();
        Object.defineProperty(Platform, "OS", {
            configurable: true,
            value: platform,
        });
    }
});

it("invalidates malformed/disconnected native state and refills the same revision after foreground refresh", async () => {
    const platform = Platform.OS;
    Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: "android",
    });
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
        },
    });
    queryClient.setQueryData([QUERYKEY_INPROXY_KEYPAIR], {
        privateKey: new Uint8Array(32),
        publicKey: new Uint8Array(32),
    });
    const personalCompartmentId = "jgr+fj3yz6Wpn/vV7qlP4Sh+hBkThZCDEe6+OVJEm2g";
    queryClient.setQueryData(
        [QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID],
        personalCompartmentId,
    );
    const native = recordingNativeDispatch();
    const observed: { pairing: PairingConfiguration | null } = {
        pairing: null,
    };
    function Consumer() {
        observed.pairing = useNativePairingConfiguration();
        return null;
    }
    let onAppStateChange: (state: AppStateStatus) => void = () => {};
    const appState = jest
        .spyOn(AppState, "addEventListener")
        .mockImplementation((type, listener) => {
            if (type === "change") onAppStateChange = listener;
            return { remove: () => {} };
        });
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    let renderer: ReturnType<typeof create> | undefined;
    const applied: PairingConfiguration = {
        revision: 10,
        status: "applied",
        personalCompartmentId,
    };
    async function receive(
        pairingConfiguration: PairingConfiguration,
        status: "RUNNING" | "STOPPED" | "UNKNOWN" = "RUNNING",
    ) {
        await act(async () => {
            native.emit({
                type: "proxyState",
                data: { status, pairingConfiguration },
            });
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }
    try {
        await act(async () => {
            renderer = create(
                <QueryClientProvider client={queryClient}>
                    <InproxyProvider module={native.nativeModule}>
                        <Consumer />
                    </InproxyProvider>
                </QueryClientProvider>,
            );
        });
        await receive(applied);
        expect(observed.pairing?.personalCompartmentId).toBe(
            personalCompartmentId,
        );
        await receive({
            revision: 11,
            status: "applied",
            personalCompartmentId: "private-invalid-identity",
        });
        expect(observed.pairing).toBeNull();
        expect(native.diagnostics.join(" ")).toContain(
            "Invalid native proxy state",
        );
        expect(native.diagnostics.join(" ")).not.toContain(
            "private-invalid-identity",
        );
        await receive(applied);
        expect(observed.pairing?.personalCompartmentId).toBe(
            personalCompartmentId,
        );
        await act(async () => {
            onAppStateChange("active");
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(observed.pairing).toBeNull();
        expect(native.stateRequests).toEqual(["currentState"]);
        await receive(applied); // Same revision is valid readback, not a newer application.
        expect(observed.pairing?.personalCompartmentId).toBe(
            personalCompartmentId,
        );
        await receive(
            { revision: 11, status: "applying", personalCompartmentId: null },
            "UNKNOWN",
        );
        expect(observed.pairing?.personalCompartmentId).toBeNull();
        await receive(applied); // Pre-disconnect acknowledgement must stay rejected.
        expect(observed.pairing?.personalCompartmentId).toBeNull();
        await receive(
            { revision: 12, status: "persisted", personalCompartmentId },
            "STOPPED",
        );
        expect(observed.pairing?.personalCompartmentId).toBe(
            personalCompartmentId,
        );
    } finally {
        await act(async () => {
            renderer?.unmount();
        });
        queryClient.clear();
        appState.mockRestore();
        errorLog.mockRestore();
        Object.defineProperty(Platform, "OS", {
            configurable: true,
            value: platform,
        });
    }
});

function recordingNativeDispatch() {
    const dispatched: InproxyParameters[] = [];
    const listeners = new Set<(event: InproxyEvent) => void>();
    const diagnostics: string[] = [];
    const stateRequests: string[] = [];
    const nativeModule: ConduitModuleAPI = {
        paramsChanged: async (params) => {
            dispatched.push(params);
        },
        toggleInProxy: async () => {},
        sendFeedback: async () => null,
        emitCurrentInproxyState: () => {
            stateRequests.push("currentState");
        },
        addInproxyEventListener: (listener) => {
            listeners.add(listener);
            return {
                remove: () => {
                    listeners.delete(listener);
                },
            };
        },
        addIpcEventListener: () => ({ remove: () => {} }),
        logInfo: () => {},
        logWarn: () => {},
        logError: (_tag, message) => {
            diagnostics.push(message);
        },
    };
    return {
        nativeModule,
        dispatched,
        diagnostics,
        stateRequests,
        emit: (event: InproxyEvent) => {
            listeners.forEach((listener) => listener(event));
        },
    };
}

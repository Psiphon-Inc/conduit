import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { act, create } from "react-test-renderer";

import {
    ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY,
    QUERYKEY_ANDROID_PERSONAL_COMPARTMENT_ID,
    QUERYKEY_INPROXY_KEYPAIR,
    SECURESTORE_ANDROID_PERSONAL_COMPARTMENT_ID_KEY,
} from "@/src/constants";
import { InproxyProvider, useInproxyContext } from "@/src/inproxy/context";
import type { ConduitModuleAPI } from "@/src/inproxy/module";
import type { InproxyParameters } from "@/src/inproxy/types";

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

function recordingNativeDispatch() {
    const dispatched: InproxyParameters[] = [];
    const nativeModule: ConduitModuleAPI = {
        paramsChanged: async (params) => {
            dispatched.push(params);
        },
        toggleInProxy: async () => {},
        sendFeedback: async () => null,
        emitCurrentInproxyState: () => {},
        addInproxyEventListener: () => ({ remove: () => {} }),
        addIpcEventListener: () => ({ remove: () => {} }),
        logInfo: () => {},
        logWarn: () => {},
        logError: () => {},
    };
    return { nativeModule, dispatched };
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import { z } from "zod";

import { useAccountContext } from "@/src/account/context";
import { keyPairToBase64nopad } from "@/src/common/cryptography";
import { handleError, wrapError } from "@/src/common/errors";
import {
    DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
    DEFAULT_INPROXY_MAX_CLIENTS,
} from "@/src/constants";
import {
    InProxyActivityStats,
    InProxyContextValue,
    InProxyParameters,
    InProxyParametersSchema,
} from "@/src/inproxy/types";
import {
    getDefaultInProxyParameters,
    getZeroedInProxyActivityStats,
} from "@/src/inproxy/utils";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function* generateMockData(
    maxClients: number,
): AsyncGenerator<InProxyActivityStats> {
    // initial empty data, representing no usage
    // TODO: this is a crappy way to clone
    const data = getZeroedInProxyActivityStats();

    async function doTick() {
        // shift every array to drop the first value
        data.dataByPeriod["1000ms"].connectedClients.shift();
        data.dataByPeriod["1000ms"].bytesUp.shift();
        data.dataByPeriod["1000ms"].bytesDown.shift();
        // 50% chance to add a user every tick, up to max
        if (Math.random() > 0.5 && data.currentConnectedClients < maxClients) {
            data.currentConnectedClients++;
            data.dataByPeriod["1000ms"].connectedClients.push(1);
        } else {
            data.dataByPeriod["1000ms"].connectedClients.push(0);
        }

        // 5% chance to drop a user every tick
        if (Math.random() > 0.95 && data.currentConnectedClients > 0) {
            data.currentConnectedClients--;
        }

        if (data.currentConnectedClients > 0) {
            // some random amount of bytes up and down
            const bytesUp = Math.floor(
                Math.random() * 500 * data.currentConnectedClients,
            );
            const bytesDown = Math.floor(
                Math.random() * 500 * data.currentConnectedClients,
            );
            data.dataByPeriod["1000ms"].bytesUp.push(bytesUp);
            data.dataByPeriod["1000ms"].bytesDown.push(bytesDown);
            data.totalBytesUp += bytesUp;
            data.totalBytesDown += bytesDown;
        }
        await sleep(1000);
    }

    while (true) {
        yield data;
        await doTick();
    }
}

const InProxyContext = React.createContext<InProxyContextValue | null>(null);

export function useInProxyContext(): InProxyContextValue {
    const value = React.useContext(InProxyContext);
    if (!value) {
        throw new Error(
            "useInProxyContext must be used within a InProxyProvider",
        );
    }

    return value;
}

const InProxyStateSyncSchema = z.object({
    running: z.boolean(),
    synced: z.boolean(),
});
type InProxyStateSync = z.infer<typeof InProxyStateSyncSchema>;

export function InProxyProvider({ children }: { children: React.ReactNode }) {
    console.log("MOCK: InProxyProvider rendered");
    const [inProxyStateSync, setInProxyStateSync] =
        React.useState<InProxyStateSync>({
            running: false,
            synced: false,
        });
    const [inProxyParameters, setInProxyParameters] =
        React.useState<InProxyParameters>(getDefaultInProxyParameters());

    const { conduitKeyPair } = useAccountContext();

    const queryClient = useQueryClient();

    function handleInProxyActivityStats(
        inProxyActivityStats: InProxyActivityStats,
    ): void {
        queryClient.setQueryData(
            ["inProxyCurrentConnectedClients"],
            inProxyActivityStats.currentConnectedClients,
        );
        queryClient.setQueryData(
            ["inProxyCurrentConnectingClients"],
            inProxyActivityStats.currentConnectingClients,
        );
        queryClient.setQueryData(
            ["inProxyTotalBytesTransferred"],
            inProxyActivityStats.totalBytesUp +
                inProxyActivityStats.totalBytesDown,
        );
        queryClient.setQueryData(
            ["inProxyActivityBy1000ms"],
            inProxyActivityStats.dataByPeriod["1000ms"],
        );
    }

    const mockDataGenerator = React.useRef<AsyncGenerator | null>(null);

    async function runMock(maxClients: number) {
        mockDataGenerator.current = generateMockData(maxClients);

        console.log("MOCK: Initializing mock data generation");
        let data = (await mockDataGenerator.current.next()).value;
        while (data) {
            if (data) {
                handleInProxyActivityStats(data);
            }
            data = (await mockDataGenerator.current.next()).value;
        }
        handleInProxyActivityStats(getZeroedInProxyActivityStats());
    }

    async function stopMock() {
        if (mockDataGenerator.current) {
            console.log("MOCK: Stopping mock data generation");
            await mockDataGenerator.current.return(
                getZeroedInProxyActivityStats(),
            );
        }
    }

    // simulate InProxy running in a background service using AsyncStorage
    React.useEffect(() => {
        async function init() {
            const running = await AsyncStorage.getItem("MockInProxyRunning");
            console.log("check if inproxy running, stored value: ", running);
            if (running === "1") {
                setInProxyStateSync({
                    running: true,
                    synced: true,
                });
            } else {
                setInProxyStateSync({
                    running: false,
                    synced: true,
                });
            }
        }
        init();
    }, []);

    async function selectInProxyParameters(params: InProxyParameters) {
        await AsyncStorage.setItem(
            "InProxyMaxClients",
            params.maxClients.toString(),
        );
        await AsyncStorage.setItem(
            "InProxyLimitBytesPerSecond",
            params.limitUpstreamBytesPerSecond.toString(),
        );
        setInProxyParameters(params);
        console.log(
            "MOCK: InProxy parameters selected successfully, NOTE: will not restart",
        );
    }

    async function toggleInProxy() {
        await AsyncStorage.setItem(
            "MockInProxyRunning",
            inProxyStateSync.running ? "0" : "1",
        );
        setInProxyStateSync({
            running: !inProxyStateSync.running,
            synced: true,
        });
        console.log("MOCK: InProxyModule.toggleInProxy() invoked");
        if (inProxyStateSync.running) {
            await stopMock();
        } else {
            // this awaits forever
            await runMock(inProxyParameters!.maxClients);
        }
    }

    async function sendFeedback() {
        console.log("MOCK: InProxyModule.sendFeedback() invoked");
    }

    // We store the user-controllable InProxy settings in AsyncStorage, so that
    // they can be persisted at the application layer instead of the module
    // layer. This also allows us to have defaults that are different than what
    // the module/tunnel-core uses. The values stored in AsyncStorage will be
    // taken as the source of truth.
    async function loadInProxyParameters() {
        try {
            // Retrieve stored inproxy parameters from the application layer
            const storedInProxyMaxClients =
                await AsyncStorage.getItem("InProxyMaxClients");

            const storedInProxyLimitBytesPerSecond = await AsyncStorage.getItem(
                "InProxyLimitBytesPerSecond",
            );

            // Prepare the stored/default parameters from the application layer
            const storedInProxyParameters = InProxyParametersSchema.parse({
                privateKey: keyPairToBase64nopad(conduitKeyPair),
                maxClients: storedInProxyMaxClients
                    ? parseInt(storedInProxyMaxClients)
                    : DEFAULT_INPROXY_MAX_CLIENTS,
                limitUpstreamBytesPerSecond: storedInProxyLimitBytesPerSecond
                    ? parseInt(storedInProxyLimitBytesPerSecond)
                    : DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
                limitDownstreamBytesPerSecond: storedInProxyLimitBytesPerSecond
                    ? parseInt(storedInProxyLimitBytesPerSecond)
                    : DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
            });

            // sets the inproxy parameters in the psiphon context. This call
            // also updates the context's state value for the inproxy
            // parameters, so an explicit call to sync them is not needed.
            await selectInProxyParameters(storedInProxyParameters);
        } catch (error) {
            handleError(wrapError(error, "Failed to load inproxy parameters"));
        }
    }

    React.useEffect(() => {
        // Loads stored InProxy parameters on first render.
        loadInProxyParameters();
    }, []);

    const value = {
        inProxyParameters,
        toggleInProxy,
        selectInProxyParameters,
        sendFeedback,
    };

    return (
        <InProxyContext.Provider value={value}>
            {children}
        </InProxyContext.Provider>
    );
}

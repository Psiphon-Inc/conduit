import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";

import {
    InProxyActivityByPeriod,
    InProxyActivityStats,
    InProxyParameters,
    InProxyStatus,
    getDefaultInProxyParameters,
    getZeroedInProxyActivityStats,
} from "@/src/psiphon/inproxy";
import { z } from "zod";

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

export interface InProxyActivityContextValue {
    inProxyActivityBy1000ms: InProxyActivityByPeriod;
    inProxyCurrentConnectedClients: number;
    inProxyTotalBytesTransferred: number;
}

export const InProxyActivityContext =
    React.createContext<InProxyActivityContextValue | null>(null);

export function useInProxyActivityContext(): InProxyActivityContextValue {
    const value = React.useContext(InProxyActivityContext);
    if (!value) {
        throw new Error(
            "useInProxyActivityContext must be used within a InProxyActivityProvider",
        );
    }

    return value;
}

export function InProxyActivityProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [inProxyActivityBy1000ms, setInProxyActivityBy1000ms] =
        React.useState<InProxyActivityByPeriod>(
            getZeroedInProxyActivityStats().dataByPeriod["1000ms"],
        );
    const [inProxyCurrentConnectedClients, setInProxyCurrentConnectedClients] =
        React.useState<number>(0);
    const [inProxyTotalBytesTransferred, setInProxyTotalBytesTransferred] =
        React.useState<number>(0);

    const { inProxyParameters, getInProxyStatus } = useInProxyContext();

    function handleInProxyActivityStats(
        inProxyActivityStats: InProxyActivityStats,
    ): void {
        setInProxyCurrentConnectedClients(
            inProxyActivityStats.currentConnectedClients,
        );
        setInProxyTotalBytesTransferred(
            inProxyActivityStats.totalBytesUp +
                inProxyActivityStats.totalBytesDown,
        );
        setInProxyActivityBy1000ms(inProxyActivityStats.dataByPeriod["1000ms"]);
    }

    // mock stats emitter
    const mockDataGenerator = React.useRef<AsyncGenerator | null>(null);
    React.useEffect(() => {
        async function runMock() {
            console.log("MOCK: Initializing mock data generation");
            mockDataGenerator.current = generateMockData(
                inProxyParameters!.maxClients,
            );
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

        if (getInProxyStatus().status === "running") {
            runMock();
        } else {
            stopMock();
        }
    }, [inProxyParameters, getInProxyStatus]);

    const value = {
        inProxyActivityBy1000ms,
        inProxyCurrentConnectedClients,
        inProxyTotalBytesTransferred,
    };
    return (
        <InProxyActivityContext.Provider value={value}>
            {children}
        </InProxyActivityContext.Provider>
    );
}

export interface InProxyContextValue {
    inProxyParameters: InProxyParameters;
    inProxyMustUpgrade: boolean;
    toggleInProxy: () => Promise<void>;
    selectInProxyParameters: (params: InProxyParameters) => Promise<void>;
    getInProxyStatus: () => InProxyStatus;
    sendFeedback: () => Promise<void>;
}

export const InProxyContext = React.createContext<InProxyContextValue | null>(
    null,
);

export function useInProxyContext(): InProxyContextValue {
    const value = React.useContext(InProxyContext);
    if (!value) {
        throw new Error(
            "useInProxyContext must be used within a InProxyProvider",
        );
    }

    return value;
}

const InProxyStateSchema = z.object({
    running: z.boolean(),
    synced: z.boolean(),
});
type InProxyState = z.infer<typeof InProxyStateSchema>;

export function InProxyProvider({ children }: { children: React.ReactNode }) {
    const [inProxyState, setInProxyState] = React.useState<InProxyState>({
        running: false,
        synced: false,
    });
    const [inProxyParameters, setInProxyParameters] =
        React.useState<InProxyParameters>(getDefaultInProxyParameters());

    // TODO: how to test this with the mock?
    //const [inProxyMustUpgrade, setInProxyMustUpgrade] =
    //    React.useState<boolean>(false);
    const inProxyMustUpgrade = false;

    //function handleInProxyError(inProxyError: InProxyError): void {
    //    console.log("MOCK: Received InProxy error", inProxyError);
    //    if (inProxyError.action === "inProxyMustUpgrade") {
    //        console.log("MOCK: In-proxy must upgrade");
    //        setInProxyMustUpgrade(true);
    //    }
    //}
    //

    // simulate InProxy running in a background service using AsyncStorage
    React.useEffect(() => {
        async function init() {
            const running = await AsyncStorage.getItem("MockInProxyRunning");
            console.log("check if inproxy running, stored value: ", running);
            if (running === "1") {
                setInProxyState({
                    running: true,
                    synced: true,
                });
            } else {
                setInProxyState({
                    running: false,
                    synced: true,
                });
            }
        }
        init();
    }, []);

    async function selectInProxyParameters(
        params: InProxyParameters,
    ): Promise<void> {
        await AsyncStorage.setItem(
            "InProxyMaxClients",
            params.maxClients.toString(),
        );
        await AsyncStorage.setItem(
            "InProxyLimitBytesPerSecond",
            params.limitUpstreamBytesPerSecond.toString(),
        );
        setInProxyParameters(params);
        console.log("MOCK: InProxy parameters selected successfully", params);
    }

    async function toggleInProxy(): Promise<void> {
        //await requestNotificationsPermissions();
        await AsyncStorage.setItem(
            "MockInProxyRunning",
            inProxyState.running ? "0" : "1",
        );
        setInProxyState({ running: !inProxyState.running, synced: true });
        console.log("MOCK: InProxyModule.toggleInProxy() invoked");
    }

    const getInProxyStatus = React.useCallback(() => {
        if (!inProxyState.synced) {
            return { status: "unknown" };
        } else {
            return inProxyState.running
                ? { status: "running" }
                : { status: "stopped" };
        }
    }, [inProxyState]);

    async function sendFeedback(): Promise<void> {
        console.log("MOCK: InProxyModule.sendFeedback() invoked");
    }

    const value = {
        inProxyParameters,
        inProxyMustUpgrade,
        toggleInProxy,
        selectInProxyParameters,
        getInProxyStatus,
        sendFeedback,
    };

    return (
        <InProxyContext.Provider value={value}>
            {children}
        </InProxyContext.Provider>
    );
}

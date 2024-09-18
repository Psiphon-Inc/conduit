import React from "react";

import {
    InProxyActivityByPeriod,
    InProxyActivityStats,
    InProxyParameters,
    zeroedInProxyActivityStats,
} from "@/src/psiphon/inproxy";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function* generateMockData(
    maxClients: number,
): AsyncGenerator<InProxyActivityStats> {
    // initial empty data, representing no usage
    // TODO: this is a crappy way to clone
    const data = JSON.parse(JSON.stringify(zeroedInProxyActivityStats));

    async function doTick() {
        // shift every array to drop the first value
        data.dataByPeriod["1000ms"].connectedClients.shift();
        data.dataByPeriod["1000ms"].bytesUp.shift();
        data.dataByPeriod["1000ms"].bytesDown.shift();
        // 50% chance to add a user every tick, up to max
        if (Math.random() > 0.5 && data.currentConnectedClients <= maxClients) {
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

export interface InProxyContextValue {
    inProxyParameters: InProxyParameters | null;
    inProxyActivityBy1000ms: InProxyActivityByPeriod;
    inProxyCurrentConnectedClients: number;
    inProxyTotalBytesTransferred: number;
    inProxyMustUpgrade: boolean;
    toggleInProxy: () => Promise<void>;
    selectInProxyParameters: (params: InProxyParameters) => Promise<void>;
    isInProxyRunning: () => boolean;
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

export function InProxyProvider({ children }: { children: React.ReactNode }) {
    const [inProxyRunning, setInProxyRunning] = React.useState<boolean>(false);
    const [inProxyParameters, setInProxyParameters] =
        React.useState<InProxyParameters | null>(null);
    const [inProxyActivityBy1000ms, setInProxyActivityBy1000ms] =
        React.useState<InProxyActivityByPeriod>(
            zeroedInProxyActivityStats.dataByPeriod["1000ms"],
        );
    const [inProxyCurrentConnectedClients, setInProxyCurrentConnectedClients] =
        React.useState<number>(0);
    const [inProxyTotalBytesTransferred, setInProxyTotalBytesTransferred] =
        React.useState<number>(0);
    // TODO: how to test this with the mock?
    //const [inProxyMustUpgrade, setInProxyMustUpgrade] =
    //    React.useState<boolean>(false);
    const inProxyMustUpgrade = false;

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

    //function handleInProxyError(inProxyError: InProxyError): void {
    //    console.log("MOCK: Received InProxy error", inProxyError);
    //    if (inProxyError.action === "inProxyMustUpgrade") {
    //        console.log("MOCK: In-proxy must upgrade");
    //        setInProxyMustUpgrade(true);
    //    }
    //}

    async function selectInProxyParameters(
        params: InProxyParameters,
    ): Promise<void> {
        setInProxyParameters(params);
        console.log("MOCK: InProxy parameters selected successfully");
    }

    async function toggleInProxy(): Promise<void> {
        //await requestNotificationsPermissions();
        setInProxyRunning(!inProxyRunning);
        console.log("MOCK: InProxyModule.toggleInProxy() invoked");
        setInProxyCurrentConnectedClients(0);
    }

    const isInProxyRunning = React.useCallback(() => {
        return inProxyRunning;
    }, [inProxyRunning]);

    async function sendFeedback(): Promise<void> {
        console.log("MOCK: InProxyModule.sendFeedback() invoked");
    }

    // mock stats emitter
    // DO THIS A SMARTER WAY
    const mockDataGenerator = React.useRef<AsyncGenerator | null>(null);
    React.useEffect(() => {
        if (inProxyParameters) {
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
                handleInProxyActivityStats(zeroedInProxyActivityStats);
            }

            async function stopMock() {
                if (mockDataGenerator.current) {
                    console.log("MOCK: Stopping mock data generation");
                    await mockDataGenerator.current.return(
                        zeroedInProxyActivityStats,
                    );
                }
            }

            if (inProxyRunning) {
                runMock();
            } else {
                stopMock();
            }
        }
    }, [inProxyParameters, inProxyRunning]);

    const value = {
        inProxyParameters,
        inProxyActivityBy1000ms,
        inProxyCurrentConnectedClients,
        inProxyTotalBytesTransferred,
        inProxyMustUpgrade,
        toggleInProxy,
        selectInProxyParameters,
        isInProxyRunning,
        sendFeedback,
    };

    return (
        <InProxyContext.Provider value={value}>
            {children}
        </InProxyContext.Provider>
    );
}

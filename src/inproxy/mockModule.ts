import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeEventEmitter } from "react-native";

import { ConduitModuleAPI } from "@/src/inproxy/module";
import { InProxyActivityStats } from "@/src/inproxy/types";
import { getZeroedInProxyActivityStats } from "@/src/inproxy/utils";

//toggleInProxy: (
//    maxClients: number,
//    limitUpstreamBytesPerSecond: number,
//    limitDownstreamBytesPerSecond: number,
//    privateKey: string,
//) => Promise<void>;
//paramsChanged: (
//    maxClients: number,
//    limitUpstreamBytesPerSecond: number,
//    limitDownstreamBytesPerSecond: number,
//    privateKey: string,
//) => Promise<void>;
//addListener: (eventName: string) => void;
//removeListeners: (count: number) => void;
//sendFeedback: () => Promise<null | string>;
//logInfo: (tag: string, msg: string) => void;
//logError: (tag: string, msg: string) => void;
//logWarn: (tag: string, msg: string) => void;
//
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function* generateMockData(
    maxClients: number,
    limitBandwidth: number,
): AsyncGenerator<InProxyActivityStats> {
    // initial empty data, representing no usage
    // TODO: this is a crappy way to clone
    const data = getZeroedInProxyActivityStats();

    async function doTick() {
        // shift every array to drop the first value
        data.dataByPeriod["1000ms"].connectedClients.shift();
        data.dataByPeriod["1000ms"].connectingClients.shift();
        data.dataByPeriod["1000ms"].bytesUp.shift();
        data.dataByPeriod["1000ms"].bytesDown.shift();

        // 5% chance to drop a connected client
        if (Math.random() > 0.95 && data.currentConnectedClients > 0) {
            data.currentConnectedClients--;
        }

        // 50% chance to convert a connecting user to a connected user
        if (
            Math.random() > 0.5 &&
            data.currentConnectingClients > 0 &&
            data.currentConnectedClients < maxClients
        ) {
            data.currentConnectedClients++;
            data.currentConnectingClients--;
            data.dataByPeriod["1000ms"].connectedClients.push(1);
        } else {
            data.dataByPeriod["1000ms"].connectedClients.push(0);
        }

        // 30% chance to drop a connecting client
        if (Math.random() > 0.7 && data.currentConnectingClients > 0) {
            data.currentConnectingClients--;
        }

        // 50% chance to add a connecting user
        if (Math.random() > 0.5 && data.currentConnectedClients < maxClients) {
            data.currentConnectingClients++;
            data.dataByPeriod["1000ms"].connectingClients.push(1);
        } else {
            data.dataByPeriod["1000ms"].connectingClients.push(0);
        }

        if (data.currentConnectedClients > 0) {
            // some random amount of bytes up and down
            const bytesUp = Math.floor(
                Math.random() *
                    (limitBandwidth / 50 / data.currentConnectedClients) *
                    data.currentConnectedClients,
            );
            const bytesDown = Math.floor(
                Math.random() *
                    (limitBandwidth / 50 / data.currentConnectedClients) *
                    data.currentConnectedClients,
            );
            data.dataByPeriod["1000ms"].bytesUp.push(bytesUp);
            data.dataByPeriod["1000ms"].bytesDown.push(bytesDown);
            data.totalBytesUp += bytesUp;
            data.totalBytesDown += bytesDown;
        } else {
            data.dataByPeriod["1000ms"].bytesUp.push(0);
            data.dataByPeriod["1000ms"].bytesDown.push(0);
        }
        await sleep(1000);
    }

    while (true) {
        yield data;
        await doTick();
    }
}

// We need to initialize the NativeEventEmitter in the mock class so we can emit
// values back out of it, but we don't have a NativeModule object to pass in
// yet, since the class itself will be used to instantiate the mocked
// NativeModule object. On Android we can simply omit any argument to the new
// NativeEventEmitter() constructor, but on iOS, one is required. To work around
// this, we will pass this dummy object which satisfies the required
// NativeModule interface.
const dummyNativeModule = {
    addListener: (_: string) => {
        return;
    },
    removeListeners: (_: number) => {
        return;
    },
};

class ConduitModuleMock {
    private running: boolean = false;
    private mockDataGenerator: AsyncGenerator | null = null;
    private nativeEventEmitter: NativeEventEmitter;

    constructor() {
        AsyncStorage.getItem("MockInProxyRunning").then(
            (wasRunning: string | null) => {
                if (wasRunning === "1") {
                    this.running = true;
                }
            },
        );
        this.nativeEventEmitter = new NativeEventEmitter(dummyNativeModule);
        this.emitState();

        // NOTE: the mock data emitter will reset when the app reloads, unlike
        // the actual module.
    }

    private emitState() {
        this.nativeEventEmitter.emit("ConduitEvent", {
            type: "proxyState",
            data: {
                status: this.running ? "RUNNING" : "STOPPED",
                networkState: "HAS_INTERNET",
            },
        });
    }

    private async emitMockData(maxClients: number, limitBandwidth: number) {
        this.mockDataGenerator = generateMockData(maxClients, limitBandwidth);

        console.log("MOCK: Initializing mock data generation");
        let data = (await this.mockDataGenerator.next()).value;
        while (data) {
            if (data) {
                this.nativeEventEmitter.emit("ConduitEvent", {
                    type: "inProxyActivityStats",
                    data: data,
                });
            }
            data = (await this.mockDataGenerator.next()).value;
        }
        this.nativeEventEmitter.emit("ConduitEvent", {
            type: "inProxyActivityStats",
            data: getZeroedInProxyActivityStats(),
        });
    }
    private async stopMockData() {
        if (this.mockDataGenerator) {
            console.log("MOCK: Stopping mock data generation");
            await this.mockDataGenerator.return(
                getZeroedInProxyActivityStats(),
            );
        }
    }

    public addListener(name: string) {
        console.log(`ConduitModuleMock.addListener(${name})`);
        this.emitState();
    }

    public removeListeners(count: number) {
        console.log(`ConduitModuleMock.removeListeners(${count})`);
        this.emitState();
    }

    public async sendFeedback() {
        console.log("ConduitModuleMock.sendFeedback()");
        return null;
    }

    public logInfo(tag: string, msg: string) {
        console.log(`ConduitModuleMock.logInfo TAG=${tag} msg=${msg}`);
    }

    public logWarn(tag: string, msg: string) {
        console.warn(`ConduitModuleMock.logWarn TAG=${tag} msg=${msg}`);
    }

    public logError(tag: string, msg: string) {
        console.error(`ConduitModuleMock.logError TAG=${tag} msg=${msg}`);
    }

    public async toggleInProxy(
        maxClients: number,
        limitUpstreamBytesPerSecond: number,
        limitDownstreamBytesPerSecond: number,
        _: string,
    ) {
        console.log(
            `ConduitModuleMock.toggleInProxy(${maxClients}, ${limitUpstreamBytesPerSecond}, ${limitDownstreamBytesPerSecond}, <redacted>)`,
        );
        this.running = !this.running;
        await AsyncStorage.setItem(
            "MockInProxyRunning",
            this.running ? "1" : "0",
        );
        this.emitState();
        if (this.running) {
            await this.emitMockData(
                maxClients,
                limitUpstreamBytesPerSecond + limitDownstreamBytesPerSecond,
            );
        } else {
            await this.stopMockData();
        }
    }

    public async paramsChanged(
        maxClients: number,
        limitUpstreamBytesPerSecond: number,
        limitDownstreamBytesPerSecond: number,
        privateKey: string,
    ) {
        console.log(
            `ConduitModuleMock.paramsChanged(${maxClients}, ${limitUpstreamBytesPerSecond}, ${limitDownstreamBytesPerSecond}, <redacted>)`,
        );
        this.emitState();
        if (this.running) {
            await this.toggleInProxy(
                maxClients,
                limitUpstreamBytesPerSecond,
                limitDownstreamBytesPerSecond,
                privateKey,
            );
            await this.toggleInProxy(
                maxClients,
                limitUpstreamBytesPerSecond,
                limitDownstreamBytesPerSecond,
                privateKey,
            );
        }
    }
}

export const ConduitModule: ConduitModuleAPI = new ConduitModuleMock();

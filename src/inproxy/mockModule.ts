/*
 * Copyright (c) 2024, Psiphon Inc.
 * All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EventSubscription } from "expo-modules-core";

import { timedLog } from "@/src/common/utils";
import { ASYNCSTORAGE_MOCK_INPROXY_RUNNING_KEY } from "@/src/constants";
import type { ConduitModuleAPI } from "@/src/inproxy/module";
import {
    InproxyActivityStats,
    InproxyEvent,
    InproxyParameters,
    IpcEvent,
} from "@/src/inproxy/types";
import { getZeroedInproxyActivityStats } from "@/src/inproxy/utils";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function* generateMockData(
    maxClients: number,
    limitBandwidth: number,
): AsyncGenerator<InproxyActivityStats> {
    // initial empty data, representing no usage
    // TODO: this is a crappy way to clone
    const data = getZeroedInproxyActivityStats();

    function syncSegments() {
        data.segments.total.totalBytesUp = data.totalBytesUp;
        data.segments.total.totalBytesDown = data.totalBytesDown;
        data.segments.total.currentAnnouncingWorkers =
            data.currentAnnouncingWorkers;
        data.segments.total.currentConnectingClients =
            data.currentConnectingClients;
        data.segments.total.currentConnectedClients =
            data.currentConnectedClients;
        data.segments.total.dataByPeriod["1000ms"] =
            data.dataByPeriod["1000ms"];
        data.segments.total.dataByPeriod["3600000ms"] =
            data.dataByPeriod["3600000ms"];
    }

    async function doTick() {
        // shift every array to drop the first value
        data.dataByPeriod["1000ms"].connectedClients.shift();
        data.dataByPeriod["1000ms"].connectingClients.shift();
        data.dataByPeriod["1000ms"].announcingWorkers.shift();
        data.dataByPeriod["1000ms"].bytesUp.shift();
        data.dataByPeriod["1000ms"].bytesDown.shift();

        // 25% chance to drop a connected client
        if (Math.random() > 0.75 && data.currentConnectedClients > 0) {
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

        data.currentAnnouncingWorkers = Math.max(
            maxClients -
                data.currentConnectedClients -
                data.currentConnectingClients,
            0,
        );
        data.dataByPeriod["1000ms"].announcingWorkers.push(
            data.currentAnnouncingWorkers > 0 ? 1 : 0,
        );

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
        syncSegments();
        await sleep(1000);
    }

    while (true) {
        syncSegments();
        yield data;
        await doTick();
    }
}

class ConduitModuleMock {
    private running: boolean = false;
    private mockDataGenerator: AsyncGenerator | null = null;
    private listeners = new Set<(event: InproxyEvent) => void>();
    private ipcListeners = new Set<(event: IpcEvent) => void>();

    constructor() {
        AsyncStorage.getItem(ASYNCSTORAGE_MOCK_INPROXY_RUNNING_KEY).then(
            (wasRunning: string | null) => {
                if (wasRunning === "1") {
                    this.running = true;
                }
            },
        );
        this.emitState();

        // NOTE: the mock data emitter will reset when the app reloads, unlike
        // the actual module.
    }

    private emitState() {
        this.emitEvent({
            type: "proxyState",
            data: {
                status: this.running ? "RUNNING" : "STOPPED",
                networkState: "HAS_INTERNET",
            },
        });
    }

    private emitEvent(event: InproxyEvent) {
        for (const listener of this.listeners) {
            listener(event);
        }
    }

    private async emitMockData(maxClients: number, limitBandwidth: number) {
        this.mockDataGenerator = generateMockData(maxClients, limitBandwidth);

        timedLog("MOCK: Initializing mock data generation");
        let data = (await this.mockDataGenerator.next()).value;
        while (data) {
            if (data) {
                this.emitEvent({
                    type: "inProxyActivityStats",
                    data: data,
                });
            }
            data = (await this.mockDataGenerator.next()).value;
        }
        this.emitEvent({
            type: "inProxyActivityStats",
            data: getZeroedInproxyActivityStats(),
        });
    }
    private async stopMockData() {
        if (this.mockDataGenerator) {
            timedLog("MOCK: Stopping mock data generation");
            const lastData = (await this.mockDataGenerator.next()).value;
            await this.mockDataGenerator.return(lastData);
        }
    }

    public addInproxyEventListener(
        listener: (event: InproxyEvent) => void,
    ): EventSubscription {
        timedLog(`MOCK: ConduitModule.addInproxyEventListener(...)`);
        this.listeners.add(listener);
        this.emitState();
        return {
            remove: () => {
                this.listeners.delete(listener);
            },
        } as EventSubscription;
    }

    public emitCurrentInproxyState() {
        timedLog("MOCK: ConduitModule.emitCurrentInproxyState()");
        this.emitState();
    }

    public addIpcEventListener(
        listener: (event: IpcEvent) => void,
    ): EventSubscription {
        timedLog(`MOCK: ConduitModule.addIpcEventListener(...)`);
        this.ipcListeners.add(listener);
        return {
            remove: () => {
                this.ipcListeners.delete(listener);
            },
        } as EventSubscription;
    }

    public async sendFeedback() {
        timedLog("MOCK: ConduitModuleMock.sendFeedback()");
        return null;
    }

    public logInfo(tag: string, msg: string) {
        timedLog(`MOCK: ConduitModuleMock.logInfo TAG=${tag} msg=${msg}`);
    }

    public logWarn(tag: string, msg: string) {
        console.warn(`MOCK: ConduitModuleMock.logWarn TAG=${tag} msg=${msg}`);
    }

    public logError(tag: string, msg: string) {
        console.error(`MOCK: ConduitModuleMock.logError TAG=${tag} msg=${msg}`);
    }

    public async toggleInProxy(params: InproxyParameters) {
        const {
            maxClients,
            maxPersonalClients,
            limitUpstreamBytesPerSecond,
            limitDownstreamBytesPerSecond,
            privateKey: _,
        } = params;
        const totalMaxClients = maxClients + maxPersonalClients;
        timedLog(
            `MOCK: ConduitModule.toggleInProxy(common=${maxClients}, personal=${maxPersonalClients}, ${limitUpstreamBytesPerSecond}, ${limitDownstreamBytesPerSecond}, <redacted>)`,
        );
        this.running = !this.running;
        await AsyncStorage.setItem(
            ASYNCSTORAGE_MOCK_INPROXY_RUNNING_KEY,
            this.running ? "1" : "0",
        );
        this.emitState();
        if (this.running) {
            await this.emitMockData(
                totalMaxClients,
                limitUpstreamBytesPerSecond + limitDownstreamBytesPerSecond,
            );
        } else {
            await this.stopMockData();
        }
    }

    public async paramsChanged(params: InproxyParameters) {
        const {
            maxClients,
            maxPersonalClients,
            limitUpstreamBytesPerSecond,
            limitDownstreamBytesPerSecond,
            privateKey: _,
        } = params;
        timedLog(
            `MOCK: ConduitModule.paramsChanged(common=${maxClients}, personal=${maxPersonalClients}, ${limitUpstreamBytesPerSecond}, ${limitDownstreamBytesPerSecond}, <redacted>)`,
        );
        this.emitState();
        if (this.running) {
            await this.toggleInProxy(params);
            await this.toggleInProxy(params);
        }
    }
}

export const ConduitModule: ConduitModuleAPI = new ConduitModuleMock();

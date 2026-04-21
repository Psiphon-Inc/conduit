/*
 * Copyright (c) 2026, Psiphon Inc.
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
import { EventSubscription } from "expo-modules-core";

import ExpoPsiphonTunnelCoreModule from "./src/ExpoPsiphonTunnelCoreModule";

export type InproxyParameters = {
    privateKey: string;
    maxClients: number;
    limitUpstreamBytesPerSecond: number;
    limitDownstreamBytesPerSecond: number;
    reducedStartTime?: string;
    reducedEndTime?: string;
    reducedMaxClients?: number;
    reducedLimitUpstreamBytesPerSecond?: number;
    reducedLimitDownstreamBytesPerSecond?: number;
};

export type InproxyProxyState = {
    status: "RUNNING" | "STOPPED" | "UNKNOWN";
    networkState: "HAS_INTERNET" | "NO_INTERNET" | null;
};

export type InproxyActivityStats = {
    elapsedTime: number;
    totalBytesUp: number;
    totalBytesDown: number;
    currentAnnouncingWorkers: number;
    currentConnectingClients: number;
    currentConnectedClients: number;
    dataByPeriod: {
        "1000ms": {
            bytesUp: number[];
            bytesDown: number[];
            announcingWorkers: number[];
            connectingClients: number[];
            connectedClients: number[];
            numBuckets: number;
        };
    };
};

export type InproxyEvent =
    | { type: "proxyState"; data: InproxyProxyState }
    | {
          type: "proxyError";
          data: {
              action:
                  | "inProxyStartFailed"
                  | "inProxyRestartFailed"
                  | "inProxyMustUpgrade"
                  | "unimplemented";
              message?: string;
          };
      }
    | { type: "inProxyActivityStats"; data: InproxyActivityStats };

export type IpcEvent = {
    type:
        | "bind"
        | "registerClient"
        | "unregisterClient"
        | "fetchConduitPrivateKey"
        | "stateClient";
    data: {
        status: "accepted" | "denied" | "failed" | "invalid" | "disconnected";
        timestampMs?: number;
        caller?: string;
        activeClientCount?: number;
        message?: string;
    };
};

export class InproxyUnsupportedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InproxyUnsupportedError";
    }
}

export function addInproxyEventListener(
    listener: (event: InproxyEvent) => void,
): EventSubscription {
    const subscription = ExpoPsiphonTunnelCoreModule.addListener(
        "inproxyEvent",
        (event: InproxyEvent) => {
            listener(event);
        },
    );
    ExpoPsiphonTunnelCoreModule.emitCurrentInproxyState();
    return subscription;
}

export function addIpcEventListener(
    listener: (event: IpcEvent) => void,
): EventSubscription {
    return ExpoPsiphonTunnelCoreModule.addListener(
        "ipcEvent",
        (event: IpcEvent) => {
            listener(event);
        },
    );
}

export function emitCurrentInproxyState(): void {
    ExpoPsiphonTunnelCoreModule.emitCurrentInproxyState();
}

export async function toggleInProxy(params: InproxyParameters): Promise<void> {
    try {
        await ExpoPsiphonTunnelCoreModule.toggleInProxy(params);
    } catch (error: any) {
        if (error?.code === "ERR_UNIMPLEMENTED") {
            throw new InproxyUnsupportedError(
                error?.message ??
                    "In-proxy station mode is not implemented on iOS",
            );
        }
        throw error;
    }
}

export async function paramsChanged(params: InproxyParameters): Promise<void> {
    try {
        await ExpoPsiphonTunnelCoreModule.paramsChanged(params);
    } catch (error: any) {
        if (error?.code === "ERR_UNIMPLEMENTED") {
            throw new InproxyUnsupportedError(
                error?.message ??
                    "In-proxy station mode is not implemented on iOS",
            );
        }
        throw error;
    }
}

export async function stopInProxy(): Promise<void> {
    try {
        await ExpoPsiphonTunnelCoreModule.stopInProxy();
    } catch (error: any) {
        if (error?.code === "ERR_UNIMPLEMENTED") {
            throw new InproxyUnsupportedError(
                error?.message ??
                    "In-proxy station mode is not implemented on iOS",
            );
        }
        throw error;
    }
}

export async function sendFeedback(inproxyId: string): Promise<null | string> {
    try {
        return await ExpoPsiphonTunnelCoreModule.sendFeedback(inproxyId);
    } catch (error: any) {
        if (error?.code === "ERR_UNIMPLEMENTED") {
            throw new InproxyUnsupportedError(
                error?.message ?? "Feedback upload is not implemented on iOS",
            );
        }
        throw error;
    }
}

export function logInfo(tag: string, message: string): void {
    ExpoPsiphonTunnelCoreModule.logInfo(tag, message);
}

export function logError(tag: string, message: string): void {
    ExpoPsiphonTunnelCoreModule.logError(tag, message);
}

export function logWarn(tag: string, message: string): void {
    ExpoPsiphonTunnelCoreModule.logWarn(tag, message);
}

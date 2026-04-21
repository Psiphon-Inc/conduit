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
import { EventSubscription } from "expo-modules-core";

import { InproxyEvent, InproxyParameters, IpcEvent } from "@/src/inproxy/types";

export interface ConduitModuleAPI {
    toggleInProxy: (params: InproxyParameters) => Promise<void>;
    paramsChanged: (params: InproxyParameters) => Promise<void>;
    emitCurrentInproxyState: () => void;
    addInproxyEventListener: (
        listener: (event: InproxyEvent) => void,
    ) => EventSubscription;
    addIpcEventListener: (
        listener: (event: IpcEvent) => void,
    ) => EventSubscription;
    sendFeedback: (inproxyId: string) => Promise<null | string>;
    logInfo: (tag: string, msg: string) => void;
    logError: (tag: string, msg: string) => void;
    logWarn: (tag: string, msg: string) => void;
}

type TunnelCoreModule = {
    toggleInProxy: (params: InproxyParameters) => Promise<void>;
    paramsChanged: (params: InproxyParameters) => Promise<void>;
    emitCurrentInproxyState: () => void;
    sendFeedback: (inproxyId: string) => Promise<null | string>;
    logInfo: (tag: string, msg: string) => void;
    logError: (tag: string, msg: string) => void;
    logWarn: (tag: string, msg: string) => void;
    addInproxyEventListener: (
        listener: (event: InproxyEvent) => void,
    ) => EventSubscription;
    addIpcEventListener: (
        listener: (event: IpcEvent) => void,
    ) => EventSubscription;
};

const DEV_SIMULATED_DATA_ENV_KEYS = [
    "DEV_SIMULATED_DATA",
    "EXPO_PUBLIC_DEV_SIMULATED_DATA",
];

function makeTunnelCoreAdapter(module: TunnelCoreModule): ConduitModuleAPI {
    return {
        toggleInProxy: (params) => module.toggleInProxy(params),
        paramsChanged: (params) => module.paramsChanged(params),
        emitCurrentInproxyState: () => module.emitCurrentInproxyState(),
        addInproxyEventListener: (listener) =>
            module.addInproxyEventListener(listener),
        addIpcEventListener: (listener) => module.addIpcEventListener(listener),
        sendFeedback: (inproxyId) => module.sendFeedback(inproxyId),
        logInfo: (tag, msg) => module.logInfo(tag, msg),
        logError: (tag, msg) => module.logError(tag, msg),
        logWarn: (tag, msg) => module.logWarn(tag, msg),
    };
}

function readEnv(name: string): string | undefined {
    const env = process.env as Record<string, string | undefined>;
    const value = env[name];
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    return trimmed;
}

function readBooleanEnvAny(names: string[], fallback: boolean): boolean {
    for (const name of names) {
        const value = readEnv(name);
        if (!value) {
            continue;
        }
        const normalized = value.toLowerCase();
        if (
            normalized === "1" ||
            normalized === "true" ||
            normalized === "yes"
        ) {
            return true;
        }
        if (
            normalized === "0" ||
            normalized === "false" ||
            normalized === "no"
        ) {
            return false;
        }
    }
    return fallback;
}

function resolveConduitModule(): ConduitModuleAPI {
    const useMockModule =
        __DEV__ && readBooleanEnvAny(DEV_SIMULATED_DATA_ENV_KEYS, false);

    if (useMockModule) {
        const mockModule = require("./mockModule") as {
            ConduitModule: ConduitModuleAPI;
        };
        return mockModule.ConduitModule;
    }

    let tunnelCoreModule: TunnelCoreModule | null = null;
    let tunnelCoreModuleLoadError: unknown = null;
    try {
        tunnelCoreModule =
            require("expo-psiphon-tunnel-core") as TunnelCoreModule;
    } catch (error) {
        tunnelCoreModule = null;
        tunnelCoreModuleLoadError = error;
    }

    if (tunnelCoreModule != null) {
        return makeTunnelCoreAdapter(tunnelCoreModule);
    }

    const details =
        tunnelCoreModuleLoadError instanceof Error
            ? tunnelCoreModuleLoadError.message
            : tunnelCoreModuleLoadError != null
              ? String(tunnelCoreModuleLoadError)
              : "unknown native-module load failure";
    throw new Error(
        `Conduit native module unavailable: ${details}. Refusing to fall back to mock module.`,
    );
}

export const ConduitModule: ConduitModuleAPI = resolveConduitModule();

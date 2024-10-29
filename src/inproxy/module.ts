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


import { NativeModules } from "react-native";

import { InproxyParameters } from "@/src/inproxy/types";

export interface ConduitModuleAPI {
    toggleInProxy: (
        maxClients: number,
        limitUpstreamBytesPerSecond: number,
        limitDownstreamBytesPerSecond: number,
        privateKey: string,
    ) => Promise<void>;
    // Technically the Android implementation can accept a subset of the
    // InproxyParameters, but we will always be sending them all.
    paramsChanged: (params: InproxyParameters) => Promise<void>;
    addListener: (eventName: string) => void;
    removeListeners: (count: number) => void;
    sendFeedback: (inproxyId: string) => Promise<null | string>;
    logInfo: (tag: string, msg: string) => void;
    logError: (tag: string, msg: string) => void;
    logWarn: (tag: string, msg: string) => void;
}

export const ConduitModule: ConduitModuleAPI = NativeModules.ConduitModule;

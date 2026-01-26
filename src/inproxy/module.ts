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
    toggleInProxy: (params: InproxyParameters) => Promise<void>;
    paramsChanged: (params: InproxyParameters) => Promise<void>;
    addListener: (eventName: string) => void;
    removeListeners: (count: number) => void;
    sendFeedback: (inproxyId: string) => Promise<null | string>;
    logInfo: (tag: string, msg: string) => void;
    logError: (tag: string, msg: string) => void;
    logWarn: (tag: string, msg: string) => void;
}

/**
 * Use the mock in-proxy when EXPO_PUBLIC_USE_MOCK_INPROXY=1 (e.g. in .env).
 * Lets you test the UI without ios_embedded_server_entries / Psiphon config.
 */
const useMock =
    typeof __DEV__ !== "undefined" &&
    __DEV__ &&
    process.env.EXPO_PUBLIC_USE_MOCK_INPROXY === "1";

export const ConduitModule: ConduitModuleAPI = useMock
    ? (require("./mockModule") as { ConduitModule: ConduitModuleAPI })
          .ConduitModule
    : NativeModules.ConduitModule;

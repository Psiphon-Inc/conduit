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
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import { NativeEventEmitter } from "react-native";

import { useConduitKeyPair } from "@/src/auth/hooks";
import { keyPairToBase64nopad } from "@/src/common/cryptography";
import { unpackErrorMessage, wrapError } from "@/src/common/errors";
import { timedLog } from "@/src/common/utils";
import {
    ASYNCSTORAGE_INPROXY_LIMIT_BYTES_PER_SECOND_KEY,
    ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY,
    DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
    DEFAULT_INPROXY_MAX_CLIENTS,
    QUERYKEY_INPROXY_ACTIVITY_BY_1000MS,
    QUERYKEY_INPROXY_CURRENT_CONNECTED_CLIENTS,
    QUERYKEY_INPROXY_CURRENT_CONNECTING_CLIENTS,
    QUERYKEY_INPROXY_MUST_UPGRADE,
    QUERYKEY_INPROXY_STATUS,
    QUERYKEY_INPROXY_TOTAL_BYTES_TRANSFERRED,
} from "@/src/constants";
import { ConduitModule } from "@/src/inproxy/module";
import {
    InproxyActivityStats,
    InproxyActivityStatsSchema,
    InproxyContextValue,
    InproxyEvent,
    InproxyParameters,
    InproxyParametersSchema,
    InproxyStatusEnumSchema,
    ProxyError,
    ProxyErrorSchema,
    ProxyState,
    ProxyStateSchema,
} from "@/src/inproxy/types";
import {
    getDefaultInproxyParameters,
    getProxyId,
    getZeroedInproxyActivityStats,
} from "@/src/inproxy/utils";

const InproxyContext = createContext<InproxyContextValue | null>(null);

export function useInproxyContext(): InproxyContextValue {
    const value = useContext(InproxyContext);
    if (!value) {
        throw new Error(
            "useInproxyContext must be used within a InproxyProvider",
        );
    }

    return value;
}

/**
 * The InproxyProvider exposes the ConduitModule API.
 */
export function InproxyProvider({ children }: { children: React.ReactNode }) {
    const conduitKeyPair = useConduitKeyPair();

    // This provider handles tracking the user-selected Inproxy parameters, and
    // persisting them in AsyncStorage.
    const [inproxyParameters, setInproxyParameters] =
        useState<InproxyParameters>(getDefaultInproxyParameters());

    // This provider makes use of react-query to track the data emitted by the
    // native module. When an event is received, the provider updates the query
    // data for the corresponding useQuery cache. The hooks the app uses to read
    // these values are implemented in `hooks.ts`.
    const queryClient = useQueryClient();

    useEffect(() => {
        // this manages InproxyEvent subscription and connects it to the handler
        const emitter = new NativeEventEmitter(ConduitModule);
        const subscription = emitter.addListener(
            "ConduitEvent",
            handleInproxyEvent,
        );
        timedLog("InproxyEvent subscription added");

        return () => {
            subscription.remove();
            timedLog("InproxyEvent subscription removed");
        };
    }, []);

    function handleInproxyEvent(inproxyEvent: InproxyEvent): void {
        switch (inproxyEvent.type) {
            case "proxyState":
                try {
                    handleProxyState(ProxyStateSchema.parse(inproxyEvent.data));
                } catch (error) {
                    logErrorToDiagnostic(
                        wrapError(error, "Failed to handle proxyState"),
                    );
                }
                break;
            case "proxyError":
                try {
                    handleProxyError(ProxyErrorSchema.parse(inproxyEvent.data));
                } catch (error) {
                    logErrorToDiagnostic(
                        wrapError(error, "Failed to handle proxyError"),
                    );
                }
                break;
            case "inProxyActivityStats":
                try {
                    handleInproxyActivityStats(
                        InproxyActivityStatsSchema.parse(inproxyEvent.data),
                    );
                } catch (error) {
                    logErrorToDiagnostic(
                        wrapError(
                            error,
                            "Failed to handle inproxyActivityStats",
                        ),
                    );
                }
                break;
            default:
                logErrorToDiagnostic(
                    new Error(`Unhandled event type: ${inproxyEvent.type}`),
                );
        }
    }

    function handleProxyState(proxyState: ProxyState): void {
        const inproxyStatus = InproxyStatusEnumSchema.parse(proxyState.status);
        queryClient.setQueryData([QUERYKEY_INPROXY_STATUS], inproxyStatus);
        // The module does not send an update for ActivityData when the Inproxy
        // is stopped, so reset it when we receive a non-running status.
        if (inproxyStatus !== "RUNNING") {
            handleInproxyActivityStats(getZeroedInproxyActivityStats());
        }
        // NOTE: proxyState.networkState is currently ignored
    }

    function handleProxyError(inproxyError: ProxyError): void {
        if (inproxyError.action === "inProxyMustUpgrade") {
            queryClient.setQueryData([QUERYKEY_INPROXY_MUST_UPGRADE], true);
        } else {
            // TODO: display other errors in UI?
        }
    }

    function handleInproxyActivityStats(
        inproxyActivityStats: InproxyActivityStats,
    ): void {
        queryClient.setQueryData(
            [QUERYKEY_INPROXY_CURRENT_CONNECTED_CLIENTS],
            inproxyActivityStats.currentConnectedClients,
        );
        queryClient.setQueryData(
            [QUERYKEY_INPROXY_CURRENT_CONNECTING_CLIENTS],
            inproxyActivityStats.currentConnectingClients,
        );
        queryClient.setQueryData(
            [QUERYKEY_INPROXY_TOTAL_BYTES_TRANSFERRED],
            inproxyActivityStats.totalBytesUp +
                inproxyActivityStats.totalBytesDown,
        );
        queryClient.setQueryData(
            [QUERYKEY_INPROXY_ACTIVITY_BY_1000MS],
            inproxyActivityStats.dataByPeriod["1000ms"],
        );
    }

    // We store the user-controllable Inproxy settings in AsyncStorage, so that
    // they can be persisted at the application layer instead of the module
    // layer. This also allows us to have defaults that are different than what
    // the module/tunnel-core uses. The values stored in AsyncStorage will be
    // taken as the source of truth.
    async function loadInproxyParameters() {
        if (!conduitKeyPair.data) {
            // this shouldn't be possible as the key gets set before we render
            return;
        }
        try {
            // Retrieve stored inproxy parameters from the application layer
            const storedInproxyMaxClients = await AsyncStorage.getItem(
                ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY,
            );

            const storedInproxyLimitBytesPerSecond = await AsyncStorage.getItem(
                ASYNCSTORAGE_INPROXY_LIMIT_BYTES_PER_SECOND_KEY,
            );

            // Prepare the stored/default parameters from the application layer
            const storedInproxyParameters = InproxyParametersSchema.parse({
                privateKey: keyPairToBase64nopad(conduitKeyPair.data),
                maxClients: storedInproxyMaxClients
                    ? parseInt(storedInproxyMaxClients)
                    : DEFAULT_INPROXY_MAX_CLIENTS,
                limitUpstreamBytesPerSecond: storedInproxyLimitBytesPerSecond
                    ? parseInt(storedInproxyLimitBytesPerSecond)
                    : DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
                limitDownstreamBytesPerSecond: storedInproxyLimitBytesPerSecond
                    ? parseInt(storedInproxyLimitBytesPerSecond)
                    : DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
            });

            // This call updates the context's state value for the parameters.
            await selectInproxyParameters(storedInproxyParameters);
        } catch (error) {
            logErrorToDiagnostic(
                wrapError(error, "Failed to load inproxy parameters"),
            );
        }
    }

    async function selectInproxyParameters(
        params: InproxyParameters,
    ): Promise<void> {
        await AsyncStorage.setItem(
            ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY,
            params.maxClients.toString(),
        );
        await AsyncStorage.setItem(
            ASYNCSTORAGE_INPROXY_LIMIT_BYTES_PER_SECOND_KEY,
            params.limitUpstreamBytesPerSecond.toString(),
        );
        setInproxyParameters(params);
        try {
            await ConduitModule.paramsChanged(params);
        } catch (error) {
            logErrorToDiagnostic(
                new Error("ConduitModule.paramsChanged(...) failed"),
            );
            return;
        }
        timedLog(
            "Inproxy parameters selected successfully, ConduitModule.paramsChanged(...) invoked",
        );
    }

    // ConduitModule.toggleInProxy
    async function toggleInproxy(): Promise<void> {
        try {
            await ConduitModule.toggleInProxy(inproxyParameters);
            timedLog(`ConduitModule.toggleInProxy(...) invoked`);
        } catch (error) {
            logErrorToDiagnostic(
                new Error("ConduitModule.toggleInProxy(...) failed"),
            );
        }
    }

    // ConduitModule.sendFeedback
    async function sendFeedback(): Promise<void> {
        // Log the public key before sending feedback to try to guarantee it'll
        // be in the feedback logs.
        let inproxyId: string;
        if (conduitKeyPair.data) {
            inproxyId = getProxyId(conduitKeyPair.data);
        } else {
            // Shouldn't really be possible to get here
            inproxyId = "unknown";
        }

        try {
            const feedbackResult = await ConduitModule.sendFeedback(inproxyId);
            timedLog("ConduitModule.sendFeedback() invoked");
            if (!feedbackResult === null) {
                timedLog(
                    `ConduitModule.sendFeedback() returned non-null value: ${feedbackResult}`,
                );
            }
        } catch (error) {
            logErrorToDiagnostic(wrapError(error, "Failed to send feedback"));
        }
    }

    // Wraps ConduitModule.logError
    function logErrorToDiagnostic(error: Error): void {
        const errorMessage = unpackErrorMessage(error, false);
        console.error("logErrorToDiagnostic: ", errorMessage);
        ConduitModule.logError("ConduitAppErrors", errorMessage);
    }

    useEffect(() => {
        loadInproxyParameters();
    }, [conduitKeyPair.data]);

    const value = {
        toggleInproxy,
        sendFeedback,
        inproxyParameters,
        selectInproxyParameters,
        logErrorToDiagnostic,
    };

    return (
        <InproxyContext.Provider value={value}>
            {children}
        </InproxyContext.Provider>
    );
}

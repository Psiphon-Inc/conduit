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
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { useConduitKeyPair } from "@/src/auth/hooks";
import { keyPairToBase64nopad } from "@/src/common/cryptography";
import { unpackErrorMessage, wrapError } from "@/src/common/errors";
import { timedLog } from "@/src/common/utils";
import {
    ASYNCSTORAGE_INPROXY_LIMIT_BYTES_PER_SECOND_KEY,
    ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY,
    ASYNCSTORAGE_INPROXY_MAX_PERSONAL_CLIENTS_KEY,
    ASYNCSTORAGE_INPROXY_REDUCED_END_TIME_KEY,
    ASYNCSTORAGE_INPROXY_REDUCED_LIMIT_BYTES_PER_SECOND_KEY,
    ASYNCSTORAGE_INPROXY_REDUCED_MAX_CLIENTS_KEY,
    ASYNCSTORAGE_INPROXY_REDUCED_START_TIME_KEY,
    DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
    DEFAULT_INPROXY_MAX_CLIENTS,
    DEFAULT_INPROXY_MAX_PERSONAL_CLIENTS,
    INPROXY_MAX_CLIENTS_MAX,
    INPROXY_MAX_CLIENTS_TOTAL_MAX,
    QUERYKEY_INPROXY_ACTIVITY_SEGMENTS,
    QUERYKEY_INPROXY_ACTIVITY_STATS_READY,
    QUERYKEY_INPROXY_CURRENT_ANNOUNCING_WORKERS,
    QUERYKEY_INPROXY_CURRENT_COMMON_CONNECTED_CLIENTS,
    QUERYKEY_INPROXY_CURRENT_CONNECTED_CLIENTS,
    QUERYKEY_INPROXY_CURRENT_CONNECTING_CLIENTS,
    QUERYKEY_INPROXY_CURRENT_PERSONAL_CONNECTED_CLIENTS,
    QUERYKEY_INPROXY_IPC_EVENTS,
    QUERYKEY_INPROXY_MUST_UPGRADE,
    QUERYKEY_INPROXY_REGIONAL_BREAKDOWN_BY_WINDOW,
    QUERYKEY_INPROXY_STATUS,
    QUERYKEY_INPROXY_TOTAL_BYTES_TRANSFERRED,
} from "@/src/constants";
import { useAndroidPersonalCompartmentId } from "@/src/hooks";
import { ConduitModule } from "@/src/inproxy/module";
import {
    InproxyActivityStats,
    InproxyContextValue,
    InproxyEvent,
    InproxyParameters,
    InproxyParametersSchema,
    InproxyStatusEnum,
    InproxyStatusEnumSchema,
    IpcEvent,
    IpcEventSchema,
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
const DASHBOARD_STATS_THROTTLE_MS = 5_000;
const MAX_IPC_EVENT_HISTORY = 20;

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
    const androidPersonalCompartmentIdQuery = useAndroidPersonalCompartmentId();
    const androidPersonalCompartmentId = androidPersonalCompartmentIdQuery.data;
    const isPersonalPairingReady =
        Platform.OS !== "android" || androidPersonalCompartmentId != null;

    // This provider handles tracking the user-selected Inproxy parameters, and
    // persisting them in AsyncStorage.
    const [inproxyParameters, setInproxyParameters] =
        useState<InproxyParameters>(getDefaultInproxyParameters());

    // This provider makes use of react-query to track the data emitted by the
    // native module. When an event is received, the provider updates the query
    // data for the corresponding useQuery cache. The hooks the app uses to read
    // these values are implemented in `hooks.ts`.
    const queryClient = useQueryClient();
    const lastDashboardStatsUpdateAtMsRef = useRef(0);
    const lastInproxyStatusRef = useRef<InproxyStatusEnum | null>(null);

    useEffect(() => {
        // this manages InproxyEvent subscription and connects it to the handler
        const subscription =
            ConduitModule.addInproxyEventListener(handleInproxyEvent);
        timedLog("InproxyEvent subscription added");

        return () => {
            subscription.remove();
            timedLog("InproxyEvent subscription removed");
        };
    }, []);

    useEffect(() => {
        const subscription = ConduitModule.addIpcEventListener(handleIpcEvent);
        timedLog("IpcEvent subscription added");

        return () => {
            subscription.remove();
            timedLog("IpcEvent subscription removed");
        };
    }, []);

    useEffect(() => {
        const subscription = AppState.addEventListener(
            "change",
            (nextState) => {
                if (nextState === "active") {
                    ConduitModule.emitCurrentInproxyState();
                }
            },
        );
        return () => {
            subscription.remove();
        };
    }, []);

    function handleInproxyEvent(inproxyEvent: InproxyEvent): void {
        switch (inproxyEvent.type) {
            case "proxyState":
                try {
                    const parsedProxyState = ProxyStateSchema.safeParse(
                        inproxyEvent.data,
                    );
                    if (parsedProxyState.success) {
                        handleProxyState(parsedProxyState.data);
                        break;
                    }

                    const fallbackStatus = InproxyStatusEnumSchema.safeParse(
                        (inproxyEvent.data as { status?: unknown })?.status,
                    );
                    if (fallbackStatus.success) {
                        handleProxyState({
                            status: fallbackStatus.data,
                            networkState: null,
                        });
                        break;
                    }

                    throw parsedProxyState.error;
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
                        inproxyEvent.data as InproxyActivityStats,
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
        const previousStatus = lastInproxyStatusRef.current;
        lastInproxyStatusRef.current = inproxyStatus;

        queryClient.setQueryData([QUERYKEY_INPROXY_STATUS], inproxyStatus);
        if (inproxyStatus === "RUNNING" && previousStatus !== "RUNNING") {
            queryClient.setQueryData(
                [QUERYKEY_INPROXY_ACTIVITY_STATS_READY],
                false,
            );
        }
        // The module does not send an update for ActivityData when the Inproxy
        // is stopped, so reset it when we receive a non-running status.
        if (inproxyStatus !== "RUNNING") {
            queryClient.setQueryData(
                [QUERYKEY_INPROXY_ACTIVITY_STATS_READY],
                false,
            );
            handleInproxyActivityStats(getZeroedInproxyActivityStats(), {
                forceDashboardStatsUpdate: true,
                markActivityStatsReady: false,
            });
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

    function handleIpcEvent(ipcEvent: IpcEvent): void {
        try {
            const parsedIpcEvent = IpcEventSchema.parse(ipcEvent);
            const details = [
                parsedIpcEvent.data.caller,
                parsedIpcEvent.data.activeClientCount != null
                    ? `activeClients=${parsedIpcEvent.data.activeClientCount}`
                    : null,
                parsedIpcEvent.data.message ?? null,
            ]
                .filter((value) => value != null && value !== "")
                .join(" | ");
            timedLog(
                `IPC: ${parsedIpcEvent.type} ${parsedIpcEvent.data.status}${details ? ` | ${details}` : ""}`,
            );
            queryClient.setQueryData(
                [QUERYKEY_INPROXY_IPC_EVENTS],
                (current: IpcEvent[] | undefined) =>
                    [parsedIpcEvent, ...(current ?? [])].slice(
                        0,
                        MAX_IPC_EVENT_HISTORY,
                    ),
            );
        } catch (error) {
            logErrorToDiagnostic(wrapError(error, "Failed to handle ipcEvent"));
        }
    }

    function handleInproxyActivityStats(
        inproxyActivityStats: InproxyActivityStats,
        options?: {
            forceDashboardStatsUpdate?: boolean;
            markActivityStatsReady?: boolean;
        },
    ): void {
        if (options?.markActivityStatsReady !== false) {
            queryClient.setQueryData(
                [QUERYKEY_INPROXY_ACTIVITY_STATS_READY],
                true,
            );
        }
        queryClient.setQueryData(
            [QUERYKEY_INPROXY_CURRENT_ANNOUNCING_WORKERS],
            inproxyActivityStats.currentAnnouncingWorkers,
        );
        queryClient.setQueryData(
            [QUERYKEY_INPROXY_CURRENT_CONNECTED_CLIENTS],
            inproxyActivityStats.currentConnectedClients,
        );
        queryClient.setQueryData(
            [QUERYKEY_INPROXY_CURRENT_PERSONAL_CONNECTED_CLIENTS],
            inproxyActivityStats.segments.personal.currentConnectedClients,
        );
        queryClient.setQueryData(
            [QUERYKEY_INPROXY_CURRENT_COMMON_CONNECTED_CLIENTS],
            inproxyActivityStats.segments.common.currentConnectedClients,
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

        const nowMs = Date.now();
        const shouldUpdateDashboardStats =
            options?.forceDashboardStatsUpdate === true ||
            nowMs - lastDashboardStatsUpdateAtMsRef.current >=
                DASHBOARD_STATS_THROTTLE_MS;
        if (!shouldUpdateDashboardStats) {
            return;
        }

        lastDashboardStatsUpdateAtMsRef.current = nowMs;
        queryClient.setQueryData(
            [QUERYKEY_INPROXY_ACTIVITY_SEGMENTS],
            inproxyActivityStats.segments,
        );
        queryClient.setQueryData(
            [QUERYKEY_INPROXY_REGIONAL_BREAKDOWN_BY_WINDOW],
            inproxyActivityStats.regionalBreakdownByWindow,
        );
    }

    // We store the user-controllable Inproxy settings in AsyncStorage, so that
    // they can be persisted at the application layer instead of the module
    // layer. This also allows us to have defaults that are different than what
    // the module/tunnel-core uses. The values stored in AsyncStorage will be
    // taken as the source of truth.
    async function loadInproxyParameters() {
        if (
            !conduitKeyPair.data ||
            (Platform.OS === "android" &&
                androidPersonalCompartmentId === undefined)
        ) {
            // this shouldn't be possible as the key gets set before we render
            return;
        }
        try {
            // Retrieve stored inproxy parameters from the application layer
            const storedInproxyMaxClients = await AsyncStorage.getItem(
                ASYNCSTORAGE_INPROXY_MAX_CLIENTS_KEY,
            );
            const storedInproxyMaxPersonalClients = await AsyncStorage.getItem(
                ASYNCSTORAGE_INPROXY_MAX_PERSONAL_CLIENTS_KEY,
            );

            const storedInproxyLimitBytesPerSecond = await AsyncStorage.getItem(
                ASYNCSTORAGE_INPROXY_LIMIT_BYTES_PER_SECOND_KEY,
            );

            const storedInproxyReducedStartTime = await AsyncStorage.getItem(
                ASYNCSTORAGE_INPROXY_REDUCED_START_TIME_KEY,
            );
            const storedInproxyReducedEndTime = await AsyncStorage.getItem(
                ASYNCSTORAGE_INPROXY_REDUCED_END_TIME_KEY,
            );
            const storedInproxyReducedMaxClients = await AsyncStorage.getItem(
                ASYNCSTORAGE_INPROXY_REDUCED_MAX_CLIENTS_KEY,
            );
            const storedInproxyReducedLimitBytesPerSecond =
                await AsyncStorage.getItem(
                    ASYNCSTORAGE_INPROXY_REDUCED_LIMIT_BYTES_PER_SECOND_KEY,
                );

            const hasReducedSettings =
                storedInproxyReducedStartTime &&
                storedInproxyReducedEndTime &&
                storedInproxyReducedMaxClients &&
                storedInproxyReducedLimitBytesPerSecond;
            const maxClients = Math.min(
                storedInproxyMaxClients
                    ? parseInt(storedInproxyMaxClients)
                    : DEFAULT_INPROXY_MAX_CLIENTS,
                INPROXY_MAX_CLIENTS_MAX,
            );
            const personalCompartmentId =
                androidPersonalCompartmentId === undefined
                    ? undefined
                    : androidPersonalCompartmentId;
            const maxPersonalClients = personalCompartmentId
                ? Math.min(
                      storedInproxyMaxPersonalClients
                          ? parseInt(storedInproxyMaxPersonalClients)
                          : DEFAULT_INPROXY_MAX_PERSONAL_CLIENTS,
                      INPROXY_MAX_CLIENTS_MAX,
                      Math.max(0, INPROXY_MAX_CLIENTS_TOTAL_MAX - maxClients),
                  )
                : 0;

            // Prepare the stored/default parameters from the application layer
            const storedInproxyParameters = InproxyParametersSchema.parse({
                privateKey: keyPairToBase64nopad(conduitKeyPair.data),
                maxClients,
                maxPersonalClients,
                personalCompartmentId,
                limitUpstreamBytesPerSecond: storedInproxyLimitBytesPerSecond
                    ? parseInt(storedInproxyLimitBytesPerSecond)
                    : DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
                limitDownstreamBytesPerSecond: storedInproxyLimitBytesPerSecond
                    ? parseInt(storedInproxyLimitBytesPerSecond)
                    : DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
                reducedStartTime: hasReducedSettings
                    ? storedInproxyReducedStartTime
                    : undefined,
                reducedEndTime: hasReducedSettings
                    ? storedInproxyReducedEndTime
                    : undefined,
                reducedMaxClients: hasReducedSettings
                    ? Math.min(
                          parseInt(storedInproxyReducedMaxClients),
                          maxClients,
                      )
                    : undefined,
                reducedLimitUpstreamBytesPerSecond: hasReducedSettings
                    ? parseInt(storedInproxyReducedLimitBytesPerSecond)
                    : undefined,
                reducedLimitDownstreamBytesPerSecond: hasReducedSettings
                    ? parseInt(storedInproxyReducedLimitBytesPerSecond)
                    : undefined,
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
            ASYNCSTORAGE_INPROXY_MAX_PERSONAL_CLIENTS_KEY,
            params.maxPersonalClients.toString(),
        );
        await AsyncStorage.setItem(
            ASYNCSTORAGE_INPROXY_LIMIT_BYTES_PER_SECOND_KEY,
            params.limitUpstreamBytesPerSecond.toString(),
        );
        await storeOptionalAsync(
            ASYNCSTORAGE_INPROXY_REDUCED_START_TIME_KEY,
            params.reducedStartTime,
        );
        await storeOptionalAsync(
            ASYNCSTORAGE_INPROXY_REDUCED_END_TIME_KEY,
            params.reducedEndTime,
        );
        await storeOptionalAsync(
            ASYNCSTORAGE_INPROXY_REDUCED_MAX_CLIENTS_KEY,
            params.reducedMaxClients?.toString(),
        );
        await storeOptionalAsync(
            ASYNCSTORAGE_INPROXY_REDUCED_LIMIT_BYTES_PER_SECOND_KEY,
            params.reducedLimitUpstreamBytesPerSecond?.toString(),
        );
        setInproxyParameters(params);
        try {
            await ConduitModule.paramsChanged(params);
        } catch (error) {
            if (
                error instanceof Error &&
                error.name === "InproxyUnsupportedError"
            ) {
                timedLog(
                    "ConduitModule.paramsChanged(...) unsupported on this platform; continuing",
                );
                return;
            }
            if (Platform.OS === "ios") {
                timedLog(
                    `ConduitModule.paramsChanged(...) ignored on iOS: ${error instanceof Error ? error.message : String(error)}`,
                );
                return;
            }
            logErrorToDiagnostic(
                wrapError(error, "ConduitModule.paramsChanged(...) failed"),
            );
            return;
        }
        timedLog(
            "Inproxy parameters selected successfully, ConduitModule.paramsChanged(...) invoked",
        );
    }

    async function storeOptionalAsync(
        key: string,
        value?: string,
    ): Promise<void> {
        if (value === undefined) {
            await AsyncStorage.removeItem(key);
            return;
        }
        await AsyncStorage.setItem(key, value);
    }

    // ConduitModule.toggleInProxy
    async function toggleInproxy(): Promise<void> {
        try {
            await ConduitModule.toggleInProxy(inproxyParameters);
            timedLog(`ConduitModule.toggleInProxy(...) invoked`);
        } catch (error) {
            if (
                error instanceof Error &&
                error.name === "InproxyUnsupportedError"
            ) {
                timedLog(
                    "ConduitModule.toggleInProxy(...) unsupported on this platform; ignoring",
                );
                return;
            }
            if (Platform.OS === "ios") {
                timedLog(
                    `ConduitModule.toggleInProxy(...) ignored on iOS: ${error instanceof Error ? error.message : String(error)}`,
                );
                return;
            }
            logErrorToDiagnostic(
                wrapError(error, "ConduitModule.toggleInProxy(...) failed"),
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
            if (
                Platform.OS === "ios" &&
                error instanceof Error &&
                error.name === "InproxyUnsupportedError"
            ) {
                timedLog(
                    `ConduitModule.sendFeedback(...) ignored on iOS: ${error.message}`,
                );
                return;
            }
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
    }, [androidPersonalCompartmentId, conduitKeyPair.data]);

    const value = {
        inproxyParameters,
        isPersonalPairingReady,
        toggleInproxy,
        sendFeedback,
        selectInproxyParameters,
        logErrorToDiagnostic,
    };

    return (
        <InproxyContext.Provider value={value}>
            {children}
        </InproxyContext.Provider>
    );
}

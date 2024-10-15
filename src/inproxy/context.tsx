import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import { NativeEventEmitter } from "react-native";

import { useConduitKeyPair } from "@/src/auth/hooks";
import { keyPairToBase64nopad } from "@/src/common/cryptography";
import { unpackErrorMessage, wrapError } from "@/src/common/errors";
import { timedLog } from "@/src/common/utils";
import {
    DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
    DEFAULT_INPROXY_MAX_CLIENTS,
} from "@/src/constants";
import { ConduitModule } from "@/src/inproxy/module";
import {
    InProxyActivityStats,
    InProxyActivityStatsSchema,
    InProxyContextValue,
    InProxyEvent,
    InProxyParameters,
    InProxyParametersSchema,
    InProxyStatusEnumSchema,
    ProxyError,
    ProxyErrorSchema,
    ProxyState,
    ProxyStateSchema,
} from "@/src/inproxy/types";
import {
    getDefaultInProxyParameters,
    getZeroedInProxyActivityStats,
} from "@/src/inproxy/utils";

const InProxyContext = React.createContext<InProxyContextValue | null>(null);

export function useInProxyContext(): InProxyContextValue {
    const value = React.useContext(InProxyContext);
    if (!value) {
        throw new Error(
            "useInProxyContext must be used within a InProxyProvider",
        );
    }

    return value;
}

/**
 * The InProxyProvider exposes the ConduitModule API.
 */
export function InProxyProvider({ children }: { children: React.ReactNode }) {
    const conduitKeyPair = useConduitKeyPair();

    // This provider handles tracking the user-selected InProxy parameters, and
    // persisting them in AsyncStorage.
    const [inProxyParameters, setInProxyParameters] =
        React.useState<InProxyParameters>(getDefaultInProxyParameters());

    // This provider makes use of react-query to track the data emitted by the
    // native module. When an event is received, the provider updates the query
    // data for the corresponding useQuery cache. The hooks the app uses to read
    // these values are implemented in `hooks.ts`.
    const queryClient = useQueryClient();

    React.useEffect(() => {
        // this manages InProxyEvent subscription and connects it to the handler
        const emitter = new NativeEventEmitter(ConduitModule);
        const subscription = emitter.addListener(
            "ConduitEvent",
            handleInProxyEvent,
        );
        timedLog("InProxyEvent subscription added");

        return () => {
            subscription.remove();
            timedLog("InProxyEvent subscription removed");
        };
    }, []);

    function handleInProxyEvent(inProxyEvent: InProxyEvent): void {
        switch (inProxyEvent.type) {
            case "proxyState":
                try {
                    handleProxyState(ProxyStateSchema.parse(inProxyEvent.data));
                } catch (error) {
                    logErrorToDiagnostic(
                        wrapError(error, "Failed to handle proxyState"),
                    );
                }
                break;
            case "proxyError":
                try {
                    handleProxyError(ProxyErrorSchema.parse(inProxyEvent.data));
                } catch (error) {
                    logErrorToDiagnostic(
                        wrapError(error, "Failed to handle proxyError"),
                    );
                }
                break;
            case "inProxyActivityStats":
                try {
                    handleInProxyActivityStats(
                        InProxyActivityStatsSchema.parse(inProxyEvent.data),
                    );
                } catch (error) {
                    logErrorToDiagnostic(
                        wrapError(
                            error,
                            "Failed to handle inProxyActivityStats",
                        ),
                    );
                }
                break;
            default:
                logErrorToDiagnostic(
                    new Error(`Unhandled event type: ${inProxyEvent.type}`),
                );
        }
    }

    function handleProxyState(proxyState: ProxyState): void {
        const inProxyStatus = InProxyStatusEnumSchema.parse(proxyState.status);
        queryClient.setQueryData(["inProxyStatus"], inProxyStatus);
        // The module does not send an update for ActivityData when the InProxy
        // is stopped, so reset it when we receive a non-running status.
        if (inProxyStatus !== "RUNNING") {
            handleInProxyActivityStats(getZeroedInProxyActivityStats());
        }
        // NOTE: proxyState.networkState is currently ignored
    }

    function handleProxyError(inProxyError: ProxyError): void {
        if (inProxyError.action === "inProxyMustUpgrade") {
            queryClient.setQueryData(["inProxyMustUpgrade"], true);
        } else {
            // TODO: display other errors in UI?
        }
    }

    function handleInProxyActivityStats(
        inProxyActivityStats: InProxyActivityStats,
    ): void {
        queryClient.setQueryData(
            ["inProxyCurrentConnectedClients"],
            inProxyActivityStats.currentConnectedClients,
        );
        queryClient.setQueryData(
            ["inProxyCurrentConnectingClients"],
            inProxyActivityStats.currentConnectingClients,
        );
        queryClient.setQueryData(
            ["inProxyTotalBytesTransferred"],
            inProxyActivityStats.totalBytesUp +
                inProxyActivityStats.totalBytesDown,
        );
        queryClient.setQueryData(
            ["inProxyActivityBy1000ms"],
            inProxyActivityStats.dataByPeriod["1000ms"],
        );
    }

    // We store the user-controllable InProxy settings in AsyncStorage, so that
    // they can be persisted at the application layer instead of the module
    // layer. This also allows us to have defaults that are different than what
    // the module/tunnel-core uses. The values stored in AsyncStorage will be
    // taken as the source of truth.
    async function loadInProxyParameters() {
        if (!conduitKeyPair.data) {
            // this shouldn't be possible as the key gets set before we render
            return;
        }
        try {
            // Retrieve stored inproxy parameters from the application layer
            const storedInProxyMaxClients =
                await AsyncStorage.getItem("InProxyMaxClients");

            const storedInProxyLimitBytesPerSecond = await AsyncStorage.getItem(
                "InProxyLimitBytesPerSecond",
            );

            // Prepare the stored/default parameters from the application layer
            const storedInProxyParameters = InProxyParametersSchema.parse({
                privateKey: keyPairToBase64nopad(conduitKeyPair.data),
                maxClients: storedInProxyMaxClients
                    ? parseInt(storedInProxyMaxClients)
                    : DEFAULT_INPROXY_MAX_CLIENTS,
                limitUpstreamBytesPerSecond: storedInProxyLimitBytesPerSecond
                    ? parseInt(storedInProxyLimitBytesPerSecond)
                    : DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
                limitDownstreamBytesPerSecond: storedInProxyLimitBytesPerSecond
                    ? parseInt(storedInProxyLimitBytesPerSecond)
                    : DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
            });

            // This call updates the context's state value for the parameters.
            await selectInProxyParameters(storedInProxyParameters);
        } catch (error) {
            logErrorToDiagnostic(
                wrapError(error, "Failed to load inproxy parameters"),
            );
        }
    }

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
        try {
            await ConduitModule.paramsChanged(params);
        } catch (error) {
            logErrorToDiagnostic(
                new Error("ConduitModule.paramsChanged(...) failed"),
            );
            return;
        }
        timedLog(
            "InProxy parameters selected successfully, ConduitModule.paramsChanged(...) invoked",
        );
    }

    // ConduitModule.toggleInProxy
    async function toggleInProxy(): Promise<void> {
        try {
            await ConduitModule.toggleInProxy(
                inProxyParameters.maxClients,
                inProxyParameters.limitUpstreamBytesPerSecond,
                inProxyParameters.limitDownstreamBytesPerSecond,
                inProxyParameters.privateKey,
            );
            timedLog(`ConduitModule.toggleInProxy(...) invoked`);
        } catch (error) {
            logErrorToDiagnostic(
                new Error("ConduitModule.toggleInProxy(...) failed"),
            );
        }
    }

    // ConduitModule.sendFeedback
    async function sendFeedback(): Promise<void> {
        try {
            const feedbackResult = await ConduitModule.sendFeedback();
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

    React.useEffect(() => {
        loadInProxyParameters();
    }, [conduitKeyPair.data]);

    const value = {
        toggleInProxy,
        sendFeedback,
        inProxyParameters,
        selectInProxyParameters,
        logErrorToDiagnostic,
    };

    return (
        <InProxyContext.Provider value={value}>
            {children}
        </InProxyContext.Provider>
    );
}

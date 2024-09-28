import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import { NativeEventEmitter } from "react-native";

import { useAccountContext } from "@/src/account/context";
import { keyPairToBase64nopad } from "@/src/common/cryptography";
import { unpackErrorMessage, wrapError } from "@/src/common/errors";
import {
    DEFAULT_INPROXY_LIMIT_BYTES_PER_SECOND,
    DEFAULT_INPROXY_MAX_CLIENTS,
} from "@/src/constants";
import { ConduitModule } from "@/src/inproxy/module";
//import { ConduitModule } from "@/src/inproxy/mockModule";
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
import { getDefaultInProxyParameters } from "@/src/inproxy/utils";

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
    const { conduitKeyPair } = useAccountContext();

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
        console.log("InProxyEvent subscription added");

        return () => {
            subscription.remove();
            console.log("InProxyEvent subscription removed");
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
        queryClient.setQueryData(
            ["inProxyStatus"],
            InProxyStatusEnumSchema.parse(proxyState.status),
        );
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
        if (conduitKeyPair.error) {
            const conduitKeyError = wrapError(
                conduitKeyPair.error,
                "Error retrieving conduit key pair",
            );
            logErrorToDiagnostic(conduitKeyError);
            console.error(conduitKeyError);
            return;
        }
        if (!conduitKeyPair.data) {
            console.log(
                "wait until conduitKeyPair is loaded before loading other parameters",
            );
            return;
        }
        console.log("initial load of InProxyParameters from AsyncStorage");
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

            // sets the inproxy parameters in the psiphon context. This call
            // also updates the context's state value for the inproxy
            // parameters, so an explicit call to sync them is not needed.
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
            await ConduitModule.paramsChanged(
                params.maxClients,
                params.limitUpstreamBytesPerSecond,
                params.limitDownstreamBytesPerSecond,
                params.privateKey,
            );
        } catch (error) {
            logErrorToDiagnostic(
                new Error("ConduitModule.paramsChanged(...) failed"),
            );
            return;
        }
        console.log(
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
            console.log(`ConduitModule.toggleInProxy(...) invoked`);
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
            console.log("ConduitModule.sendFeedback() invoked");
            if (feedbackResult === null) {
                console.log("Feedback enqueued successfully");
            } else {
                console.log(
                    "sendFeedback returned non-null value: ",
                    feedbackResult,
                );
            }
        } catch (error) {
            logErrorToDiagnostic(wrapError(error, "Failed to send feedback"));
        }
    }

    // Wraps ConduitModule.logError
    function logErrorToDiagnostic(error: Error): void {
        const errorMessage = unpackErrorMessage(error, false);
        ConduitModule.logError("ConduitAppErrors", errorMessage);
    }

    React.useEffect(() => {
        loadInProxyParameters();
    }, [conduitKeyPair]);

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

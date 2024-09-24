import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import { NativeEventEmitter } from "react-native";

import { useAccountContext } from "@/src/account/context";
import { keyPairToBase64nopad } from "@/src/common/cryptography";
import { handleError, wrapError } from "@/src/common/errors";
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

export function InProxyProvider({ children }: { children: React.ReactNode }) {
    const [inProxyParameters, setInProxyParameters] =
        React.useState<InProxyParameters>(getDefaultInProxyParameters());

    const { conduitKeyPair } = useAccountContext();

    const queryClient = useQueryClient();

    function handleProxyState(proxyState: ProxyState): void {
        console.log("proxyState:", proxyState);
        queryClient.setQueryData(
            ["inProxyStatus"],
            InProxyStatusEnumSchema.parse(proxyState.status),
        );
        // TODO: do something with proxyState.networkState?
    }

    function handleProxyError(inProxyError: ProxyError): void {
        if (inProxyError.action === "inProxyMustUpgrade") {
            console.log("In-proxy must upgrade");
            queryClient.setQueryData(["inProxyMustUpgrade"], true);
        } else {
            // TODO: display errors in UI?
            handleError(
                wrapError(
                    new Error(inProxyError.action),
                    "Received from ConduitModule",
                ),
            );
        }
    }

    function handleInProxyActivityStats(
        inProxyActivityStats: InProxyActivityStats,
    ): void {
        console.log("stats:", inProxyActivityStats);
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

    function handleInProxyEvent(inProxyEvent: InProxyEvent): void {
        switch (inProxyEvent.type) {
            case "proxyState":
                try {
                    handleProxyState(ProxyStateSchema.parse(inProxyEvent.data));
                } catch (error) {
                    handleError(
                        wrapError(error, "Failed to handle proxyState"),
                    );
                }
                break;
            case "proxyError":
                try {
                    handleProxyError(ProxyErrorSchema.parse(inProxyEvent.data));
                } catch (error) {
                    handleError(
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
                    handleError(
                        wrapError(
                            error,
                            "Failed to handle inProxyActivityStats",
                        ),
                    );
                }
                break;
            default:
                handleError(
                    new Error(`Unhandled event type: ${inProxyEvent.type}`),
                );
        }
    }

    React.useEffect(() => {
        // manage InProxyEvent subscription
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

    // We store the user-controllable InProxy settings in AsyncStorage, so that
    // they can be persisted at the application layer instead of the module
    // layer. This also allows us to have defaults that are different than what
    // the module/tunnel-core uses. The values stored in AsyncStorage will be
    // taken as the source of truth.
    async function loadInProxyParameters() {
        try {
            // Retrieve stored inproxy parameters from the application layer
            const storedInProxyMaxClients =
                await AsyncStorage.getItem("InProxyMaxClients");

            const storedInProxyLimitBytesPerSecond = await AsyncStorage.getItem(
                "InProxyLimitBytesPerSecond",
            );

            // Prepare the stored/default parameters from the application layer
            const storedInProxyParameters = InProxyParametersSchema.parse({
                privateKey: keyPairToBase64nopad(conduitKeyPair),
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
            handleError(wrapError(error, "Failed to load inproxy parameters"));
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
            handleError(new Error("ConduitModule.paramsChanged(...) failed"));
            return;
        }
        console.log(
            "InProxy parameters selected successfully, ConduitModule.paramsChanged(...) invoked",
        );
    }

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
            handleError(new Error("ConduitModule.toggleInProxy(...) failed"));
        }
    }

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
            handleError(wrapError(error, "Failed to send feedback"));
        }
    }

    React.useEffect(() => {
        // Loads InProxy parameters on first render.
        // Note that right now, this means that we ALWAYS set the InProxy params
        // in the module on app start, even if they have not changed.
        loadInProxyParameters();
    }, []);

    const value = {
        inProxyParameters,
        toggleInProxy,
        selectInProxyParameters,
        sendFeedback,
    };

    return (
        <InProxyContext.Provider value={value}>
            {children}
        </InProxyContext.Provider>
    );
}

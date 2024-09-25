import { DefinedUseQueryResult, useQuery } from "@tanstack/react-query";

import {
    InProxyActivityByPeriod,
    InProxyStatusEnum,
} from "@/src/inproxy/types";
import { getZeroedInProxyActivityStats } from "@/src/inproxy/utils";

// These useQuery hooks are used to cache the data emitted by the ConduitModule.
// Note that each queryFn is an empty function, this is because the data cached
// is controlled by the InProxyContext. Anything the ConduitModule emits that we
// want to track or share throughout the app should have an associated hook.

export const useInProxyStatus = (): DefinedUseQueryResult<InProxyStatusEnum> =>
    useQuery({
        queryKey: ["inProxyStatus"],
        queryFn: () => undefined,
        initialData: "UNKNOWN",
        enabled: false,
    });

export const useInProxyActivityBy1000ms =
    (): DefinedUseQueryResult<InProxyActivityByPeriod> =>
        useQuery({
            queryKey: ["inProxyActivityBy1000ms"],
            queryFn: () => undefined,
            initialData: getZeroedInProxyActivityStats().dataByPeriod["1000ms"],
            enabled: false,
        });

export const useInProxyCurrentConnectedClients =
    (): DefinedUseQueryResult<number> =>
        useQuery({
            queryKey: ["inProxyCurrentConnectedClients"],
            queryFn: () => undefined,
            initialData: 0,
            enabled: false,
        });

export const useInProxyCurrentConnectingClients =
    (): DefinedUseQueryResult<number> =>
        useQuery({
            queryKey: ["inProxyCurrentConnectingClients"],
            queryFn: () => undefined,
            initialData: 0,
            enabled: false,
        });

export const useInProxyTotalBytesTransferred =
    (): DefinedUseQueryResult<number> =>
        useQuery({
            queryKey: ["inProxyTotalBytesTransferred"],
            queryFn: () => undefined,
            initialData: 0,
            enabled: false,
        });

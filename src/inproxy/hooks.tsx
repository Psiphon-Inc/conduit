import { DefinedUseQueryResult, useQuery } from "@tanstack/react-query";

import {
    InproxyActivityByPeriod,
    InproxyStatusEnum,
} from "@/src/inproxy/types";
import { getZeroedInproxyActivityStats } from "@/src/inproxy/utils";

// These useQuery hooks are used to cache the data emitted by the ConduitModule.
// Note that each queryFn is an empty function, this is because the data cached
// is controlled by the InproxyContext. Anything the ConduitModule emits that we
// want to track or share throughout the app should have an associated hook.

export const useInproxyStatus = (): DefinedUseQueryResult<InproxyStatusEnum> =>
    useQuery({
        queryKey: ["inproxyStatus"],
        queryFn: () => undefined,
        initialData: "UNKNOWN",
        enabled: false,
    });

export const useInproxyActivityBy1000ms =
    (): DefinedUseQueryResult<InproxyActivityByPeriod> =>
        useQuery({
            queryKey: ["inproxyActivityBy1000ms"],
            queryFn: () => undefined,
            initialData: getZeroedInproxyActivityStats().dataByPeriod["1000ms"],
            enabled: false,
        });

export const useInproxyCurrentConnectedClients =
    (): DefinedUseQueryResult<number> =>
        useQuery({
            queryKey: ["inproxyCurrentConnectedClients"],
            queryFn: () => undefined,
            initialData: 0,
            enabled: false,
        });

export const useInproxyCurrentConnectingClients =
    (): DefinedUseQueryResult<number> =>
        useQuery({
            queryKey: ["inproxyCurrentConnectingClients"],
            queryFn: () => undefined,
            initialData: 0,
            enabled: false,
        });

export const useInproxyTotalBytesTransferred =
    (): DefinedUseQueryResult<number> =>
        useQuery({
            queryKey: ["inproxyTotalBytesTransferred"],
            queryFn: () => undefined,
            initialData: 0,
            enabled: false,
        });

export const useInproxyMustUpgrade = (): DefinedUseQueryResult<boolean> =>
    useQuery({
        queryKey: ["inproxyMustUpgrade"],
        queryFn: () => undefined,
        initialData: false,
        enabled: false,
    });

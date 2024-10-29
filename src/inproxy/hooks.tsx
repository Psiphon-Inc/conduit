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


import { DefinedUseQueryResult, useQuery } from "@tanstack/react-query";

import {
    QUERYKEY_INPROXY_ACTIVITY_BY_1000MS,
    QUERYKEY_INPROXY_CURRENT_CONNECTED_CLIENTS,
    QUERYKEY_INPROXY_CURRENT_CONNECTING_CLIENTS,
    QUERYKEY_INPROXY_MUST_UPGRADE,
    QUERYKEY_INPROXY_STATUS,
    QUERYKEY_INPROXY_TOTAL_BYTES_TRANSFERRED,
} from "@/src/constants";
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
        queryKey: [QUERYKEY_INPROXY_STATUS],
        queryFn: () => undefined,
        initialData: "UNKNOWN",
        enabled: false,
    });

export const useInproxyActivityBy1000ms =
    (): DefinedUseQueryResult<InproxyActivityByPeriod> =>
        useQuery({
            queryKey: [QUERYKEY_INPROXY_ACTIVITY_BY_1000MS],
            queryFn: () => undefined,
            initialData: getZeroedInproxyActivityStats().dataByPeriod["1000ms"],
            enabled: false,
        });

export const useInproxyCurrentConnectedClients =
    (): DefinedUseQueryResult<number> =>
        useQuery({
            queryKey: [QUERYKEY_INPROXY_CURRENT_CONNECTED_CLIENTS],
            queryFn: () => undefined,
            initialData: 0,
            enabled: false,
        });

export const useInproxyCurrentConnectingClients =
    (): DefinedUseQueryResult<number> =>
        useQuery({
            queryKey: [QUERYKEY_INPROXY_CURRENT_CONNECTING_CLIENTS],
            queryFn: () => undefined,
            initialData: 0,
            enabled: false,
        });

export const useInproxyTotalBytesTransferred =
    (): DefinedUseQueryResult<number> =>
        useQuery({
            queryKey: [QUERYKEY_INPROXY_TOTAL_BYTES_TRANSFERRED],
            queryFn: () => undefined,
            initialData: 0,
            enabled: false,
        });

export const useInproxyMustUpgrade = (): DefinedUseQueryResult<boolean> =>
    useQuery({
        queryKey: [QUERYKEY_INPROXY_MUST_UPGRADE],
        queryFn: () => undefined,
        initialData: false,
        enabled: false,
    });

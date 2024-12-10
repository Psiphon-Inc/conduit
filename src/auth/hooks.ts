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

import { UseQueryResult, useQuery } from "@tanstack/react-query";

import { Ed25519KeyPair } from "@/src/common/cryptography";
import {
    QUERYKEY_ACCOUNT_KEYPAIR,
    QUERYKEY_INPROXY_COMPARTMENT_ID,
    QUERYKEY_INPROXY_KEYPAIR,
} from "@/src/constants";
import { Base64Unpadded32Bytes } from "../common/validators";

export const useAccountKeyPair = (): UseQueryResult<Ed25519KeyPair> =>
    useQuery({
        queryKey: [QUERYKEY_ACCOUNT_KEYPAIR],
        queryFn: () => undefined,
        enabled: false,
    });

export const useInproxyKeyPair = (): UseQueryResult<Ed25519KeyPair> =>
    useQuery({
        queryKey: [QUERYKEY_INPROXY_KEYPAIR],
        queryFn: () => undefined,
        enabled: false,
    });

export const useInproxyCompartmentId =
    (): UseQueryResult<Base64Unpadded32Bytes> =>
        useQuery({
            queryKey: [QUERYKEY_INPROXY_COMPARTMENT_ID],
            queryFn: () => undefined,
            enabled: false,
        });

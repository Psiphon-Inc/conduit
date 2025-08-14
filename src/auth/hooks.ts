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

import { createOrLoadAccount } from "@/src/auth/account";
import { Ed25519KeyPair } from "@/src/common/cryptography";
import {
    QUERYKEY_ACCOUNT_KEYPAIR,
    QUERYKEY_INPROXY_KEYPAIR,
} from "@/src/constants";

export const useAccountKeyPair = (): UseQueryResult<Ed25519KeyPair> =>
    useQuery({
        queryKey: [QUERYKEY_ACCOUNT_KEYPAIR],
        queryFn: async () => {
            const account = await createOrLoadAccount();
            if (account instanceof Error) {
                return {} as Ed25519KeyPair;
            }
            return account.accountKey;
        },
        enabled: true,
    });

export const useConduitKeyPair = (): UseQueryResult<Ed25519KeyPair> =>
    useQuery({
        queryKey: [QUERYKEY_INPROXY_KEYPAIR],
        queryFn: async () => {
            const account = await createOrLoadAccount();
            if (account instanceof Error) {
                return {} as Ed25519KeyPair;
            }
            return account.inproxyKey;
        },
        enabled: true,
    });

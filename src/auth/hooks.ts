import { UseQueryResult, useQuery } from "@tanstack/react-query";

import { Ed25519KeyPair } from "@/src/common/cryptography";
import {
    QUERYKEY_ACCOUNT_KEYPAIR,
    QUERYKEY_INPROXY_KEYPAIR,
} from "@/src/constants";

export const useAccountKeyPair = (): UseQueryResult<Ed25519KeyPair> =>
    useQuery({
        queryKey: [QUERYKEY_ACCOUNT_KEYPAIR],
        queryFn: () => undefined,
        enabled: false,
    });

export const useConduitKeyPair = (): UseQueryResult<Ed25519KeyPair> =>
    useQuery({
        queryKey: [QUERYKEY_INPROXY_KEYPAIR],
        queryFn: () => undefined,
        enabled: false,
    });

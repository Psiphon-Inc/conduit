import { UseQueryResult, useQuery } from "@tanstack/react-query";

import { Ed25519KeyPair } from "@/src/common/cryptography";

export const ACCOUNT_KEYPAIR_QUERY_KEY = "accountKeyPair";
export const INPROXY_KEYPAIR_QUERY_KEY = "conduitKeyPair";

export const useAccountKeyPair = (): UseQueryResult<Ed25519KeyPair> =>
    useQuery({
        queryKey: [ACCOUNT_KEYPAIR_QUERY_KEY],
        queryFn: () => undefined,
        enabled: false,
    });

export const useConduitKeyPair = (): UseQueryResult<Ed25519KeyPair> =>
    useQuery({
        queryKey: [INPROXY_KEYPAIR_QUERY_KEY],
        queryFn: () => undefined,
        enabled: false,
    });

import { UseQueryResult, useQuery } from "@tanstack/react-query";

import { Ed25519KeyPair } from "@/src/common/cryptography";

export const useConduitKeyPair = (): UseQueryResult<Ed25519KeyPair> =>
    useQuery({
        queryKey: ["conduitKeyPair"],
        queryFn: () => undefined,
        enabled: false,
    });

import { Platform } from "react-native";

import type {
    RevenueCatClient,
    RevenueCatSdk,
} from "@/src/hosted/revenuecatCommon";

export function createRevenueCatClientImpl(options?: {
    sdk?: RevenueCatSdk;
}): RevenueCatClient {
    if (Platform.OS === "web") {
        const { createRevenueCatClientImpl: createWebRevenueCatClientImpl } =
            require("@/src/hosted/revenuecatClientImpl.web") as {
                createRevenueCatClientImpl: (options?: {
                    sdk?: RevenueCatSdk;
                }) => RevenueCatClient;
            };
        return createWebRevenueCatClientImpl(options);
    }

    const { createRevenueCatClientImpl: createNativeRevenueCatClientImpl } =
        require("@/src/hosted/revenuecatClientImpl.native") as {
            createRevenueCatClientImpl: (options?: {
                sdk?: RevenueCatSdk;
            }) => RevenueCatClient;
        };
    return createNativeRevenueCatClientImpl(options);
}

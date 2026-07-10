import { z } from "zod";

import {
    HostedCustomerInfo,
    HostedCustomerInfoListener,
    HostedRevenueCatOfferings,
    HostedRevenueCatPackage,
} from "@/src/hosted/revenuecatTypes";

const AccountIdSchema = z.string().min(1);
const RevenueCatPublicKeysSchema = z.object({
    ios: z.string().min(1).optional(),
    android: z.string().min(1).optional(),
    web: z.string().min(1).optional(),
});

export interface RevenueCatPublicKeys {
    ios?: string;
    android?: string;
    web?: string;
}

export interface RevenueCatConfigureInput {
    publicKeys: RevenueCatPublicKeys;
    appUserId?: string;
    platformOs?: string;
}

export interface RevenueCatRestoreResult {
    customerInfo: HostedCustomerInfo;
}

export interface RevenueCatPurchaseResult {
    customerInfo: HostedCustomerInfo;
    productIdentifier: string;
}

export interface RevenueCatSdk {}

export interface RevenueCatClient {
    configure(input: RevenueCatConfigureInput): void;
    logIn(accountId: string): Promise<HostedCustomerInfo>;
    getCustomerInfo(): Promise<HostedCustomerInfo>;
    getOfferings(): Promise<HostedRevenueCatOfferings>;
    addCustomerInfoListener(listener: HostedCustomerInfoListener): () => void;
    restorePurchases(): Promise<RevenueCatRestoreResult>;
    purchasePackage(
        aPackage: HostedRevenueCatPackage,
    ): Promise<RevenueCatPurchaseResult>;
}

export function resolveRevenueCatApiKey(
    publicKeys: RevenueCatPublicKeys,
    platformOs: string,
): string {
    const parsedKeys = RevenueCatPublicKeysSchema.parse(publicKeys);
    if (platformOs === "ios") {
        if (!parsedKeys.ios) {
            throw new Error("RevenueCat public key missing for ios platform");
        }
        return parsedKeys.ios;
    }

    if (platformOs === "android") {
        if (!parsedKeys.android) {
            throw new Error(
                "RevenueCat public key missing for android platform",
            );
        }
        return parsedKeys.android;
    }

    if (platformOs === "web") {
        if (!parsedKeys.web) {
            throw new Error("RevenueCat public key missing for web platform");
        }
        return parsedKeys.web;
    }

    throw new Error(`RevenueCat is not supported on platform: ${platformOs}`);
}

export function toRevenueCatAppUserId(accountId: string): string {
    return AccountIdSchema.parse(accountId);
}

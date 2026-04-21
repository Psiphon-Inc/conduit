/*
 * Copyright (c) 2026, Psiphon Inc.
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
import { Platform } from "react-native";
import Purchases, {
    CustomerInfo,
    CustomerInfoUpdateListener,
    MakePurchaseResult,
    PurchasesConfiguration,
    PurchasesOfferings,
    PurchasesPackage,
} from "react-native-purchases";
import { z } from "zod";

const AccountIdSchema = z.string().min(1);
const RevenueCatPublicKeysSchema = z.object({
    ios: z.string().min(1).optional(),
    android: z.string().min(1).optional(),
});

export interface RevenueCatPublicKeys {
    ios?: string;
    android?: string;
}

export interface RevenueCatConfigureInput {
    publicKeys: RevenueCatPublicKeys;
    appUserId?: string;
    platformOs?: string;
}

export interface RevenueCatRestoreResult {
    customerInfo: CustomerInfo;
}

export interface RevenueCatPurchaseResult {
    customerInfo: CustomerInfo;
    productIdentifier: string;
}

export interface RevenueCatSdk {
    configure(configuration: PurchasesConfiguration): void;
    logIn(appUserID: string): Promise<{ customerInfo: CustomerInfo }>;
    getCustomerInfo(): Promise<CustomerInfo>;
    addCustomerInfoUpdateListener(listener: CustomerInfoUpdateListener): void;
    removeCustomerInfoUpdateListener(
        listener: CustomerInfoUpdateListener,
    ): boolean;
    getOfferings(): Promise<PurchasesOfferings>;
    restorePurchases(): Promise<CustomerInfo>;
    purchasePackage(aPackage: PurchasesPackage): Promise<MakePurchaseResult>;
}

export interface RevenueCatClient {
    configure(input: RevenueCatConfigureInput): void;
    logIn(accountId: string): Promise<CustomerInfo>;
    getCustomerInfo(): Promise<CustomerInfo>;
    getOfferings(): Promise<PurchasesOfferings>;
    addCustomerInfoListener(listener: CustomerInfoUpdateListener): () => void;
    restorePurchases(): Promise<RevenueCatRestoreResult>;
    purchasePackage(
        aPackage: PurchasesPackage,
    ): Promise<RevenueCatPurchaseResult>;
}

export function createRevenueCatClient(options?: {
    sdk?: RevenueCatSdk;
}): RevenueCatClient {
    const sdk = options?.sdk ?? (Purchases as RevenueCatSdk);
    let configuredApiKey: string | null = null;
    let lastLoggedInAccountId: string | null = null;
    let logLevelConfigured = false;

    function configureLogLevelIfSupported(): void {
        if (logLevelConfigured) {
            return;
        }

        const sdkWithLogLevel = sdk as RevenueCatSdk & {
            setLogLevel?: (level: string) => Promise<void>;
            LOG_LEVEL?: { WARN?: string; INFO?: string };
        };

        if (sdkWithLogLevel.setLogLevel && sdkWithLogLevel.LOG_LEVEL) {
            void sdkWithLogLevel.setLogLevel(
                sdkWithLogLevel.LOG_LEVEL.WARN ??
                    sdkWithLogLevel.LOG_LEVEL.INFO ??
                    "INFO",
            );
        }

        logLevelConfigured = true;
    }

    function configure(input: RevenueCatConfigureInput): void {
        const publicKeys = RevenueCatPublicKeysSchema.parse(input.publicKeys);
        const apiKey = resolveRevenueCatApiKey(publicKeys, input.platformOs);

        configureLogLevelIfSupported();

        if (configuredApiKey === apiKey) {
            return;
        }

        sdk.configure({
            apiKey,
            appUserID:
                input.appUserId === undefined
                    ? undefined
                    : toRevenueCatAppUserId(input.appUserId),
        });
        configuredApiKey = apiKey;

        if (input.appUserId !== undefined) {
            lastLoggedInAccountId = AccountIdSchema.parse(input.appUserId);
        } else {
            lastLoggedInAccountId = null;
        }
    }

    async function logIn(accountId: string): Promise<CustomerInfo> {
        const parsedAccountId = AccountIdSchema.parse(accountId);
        if (lastLoggedInAccountId === parsedAccountId) {
            return sdk.getCustomerInfo();
        }
        const result = await sdk.logIn(toRevenueCatAppUserId(parsedAccountId));
        lastLoggedInAccountId = parsedAccountId;
        return result.customerInfo;
    }

    async function getCustomerInfo(): Promise<CustomerInfo> {
        return sdk.getCustomerInfo();
    }

    async function getOfferings(): Promise<PurchasesOfferings> {
        return sdk.getOfferings();
    }

    function addCustomerInfoListener(
        listener: CustomerInfoUpdateListener,
    ): () => void {
        sdk.addCustomerInfoUpdateListener(listener);
        return () => {
            sdk.removeCustomerInfoUpdateListener(listener);
        };
    }

    async function restorePurchases(): Promise<RevenueCatRestoreResult> {
        const customerInfo = await sdk.restorePurchases();
        return { customerInfo };
    }

    async function purchasePackage(
        aPackage: PurchasesPackage,
    ): Promise<RevenueCatPurchaseResult> {
        const result = await sdk.purchasePackage(aPackage);
        return {
            customerInfo: result.customerInfo,
            productIdentifier: result.productIdentifier,
        };
    }

    return {
        configure,
        logIn,
        getCustomerInfo,
        getOfferings,
        addCustomerInfoListener,
        restorePurchases,
        purchasePackage,
    };
}

export function resolveRevenueCatApiKey(
    publicKeys: RevenueCatPublicKeys,
    platformOs: string = Platform.OS,
): string {
    if (platformOs === "ios") {
        if (!publicKeys.ios) {
            throw new Error("RevenueCat public key missing for ios platform");
        }
        return publicKeys.ios;
    }

    if (platformOs === "android") {
        if (!publicKeys.android) {
            throw new Error(
                "RevenueCat public key missing for android platform",
            );
        }
        return publicKeys.android;
    }

    throw new Error(`RevenueCat is not supported on platform: ${platformOs}`);
}

export function toRevenueCatAppUserId(accountId: string): string {
    return AccountIdSchema.parse(accountId);
}

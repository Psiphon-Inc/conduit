import { Platform } from "react-native";
import Purchases, {
    CustomerInfo,
    CustomerInfoUpdateListener,
    MakePurchaseResult,
    PurchasesOfferings,
    PurchasesPackage,
} from "react-native-purchases";

import {
    RevenueCatClient,
    RevenueCatConfigureInput,
    RevenueCatPurchaseResult,
    RevenueCatRestoreResult,
    RevenueCatSdk,
    resolveRevenueCatApiKey,
    toRevenueCatAppUserId,
} from "@/src/hosted/revenuecatCommon";
import {
    HostedCustomerInfo,
    HostedCustomerInfoListener,
    HostedRevenueCatOfferings,
    HostedRevenueCatPackage,
    HostedSubscriptionInfo,
} from "@/src/hosted/revenuecatTypes";

export function createRevenueCatClientImpl(options?: {
    sdk?: RevenueCatSdk;
}): RevenueCatClient {
    const sdk =
        (options?.sdk as NativeRevenueCatSdk | undefined) ??
        (Purchases as NativeRevenueCatSdk);
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
        const apiKey = resolveRevenueCatApiKey(
            input.publicKeys,
            input.platformOs ?? (Platform.OS === "ios" ? "ios" : "android"),
        );

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
            lastLoggedInAccountId = toRevenueCatAppUserId(input.appUserId);
        } else {
            lastLoggedInAccountId = null;
        }
    }

    async function logIn(accountId: string): Promise<HostedCustomerInfo> {
        const parsedAccountId = toRevenueCatAppUserId(accountId);
        if (lastLoggedInAccountId === parsedAccountId) {
            return getCustomerInfo();
        }
        const result = await sdk.logIn(parsedAccountId);
        lastLoggedInAccountId = parsedAccountId;
        return normalizeNativeCustomerInfo(result.customerInfo);
    }

    async function getCustomerInfo(): Promise<HostedCustomerInfo> {
        return normalizeNativeCustomerInfo(await sdk.getCustomerInfo());
    }

    async function getOfferings(): Promise<HostedRevenueCatOfferings> {
        return normalizeNativeOfferings(await sdk.getOfferings());
    }

    function addCustomerInfoListener(
        listener: HostedCustomerInfoListener,
    ): () => void {
        const nativeListener: CustomerInfoUpdateListener = (customerInfo) => {
            listener(normalizeNativeCustomerInfo(customerInfo));
        };
        sdk.addCustomerInfoUpdateListener(nativeListener);
        return () => {
            sdk.removeCustomerInfoUpdateListener(nativeListener);
        };
    }

    async function restorePurchases(): Promise<RevenueCatRestoreResult> {
        return {
            customerInfo: normalizeNativeCustomerInfo(
                await sdk.restorePurchases(),
            ),
        };
    }

    async function purchasePackage(
        aPackage: HostedRevenueCatPackage,
    ): Promise<RevenueCatPurchaseResult> {
        const result = await sdk.purchasePackage(
            aPackage.target as PurchasesPackage,
        );
        return normalizeNativePurchaseResult(result);
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

function normalizeNativePurchaseResult(
    result: MakePurchaseResult,
): RevenueCatPurchaseResult {
    return {
        customerInfo: normalizeNativeCustomerInfo(result.customerInfo),
        productIdentifier: result.productIdentifier,
    };
}

function normalizeNativeOfferings(
    offerings: PurchasesOfferings,
): HostedRevenueCatOfferings {
    return {
        current: offerings.current
            ? {
                  identifier: offerings.current.identifier,
                  availablePackages: offerings.current.availablePackages.map(
                      normalizeNativePackage,
                  ),
              }
            : null,
    };
}

function normalizeNativePackage(
    aPackage: PurchasesPackage,
): HostedRevenueCatPackage {
    return {
        identifier: aPackage.identifier,
        product: {
            identifier: aPackage.product.identifier,
            title: aPackage.product.title,
            priceString: aPackage.product.priceString,
        },
        target: aPackage,
    };
}

function normalizeNativeCustomerInfo(
    customerInfo: CustomerInfo,
): HostedCustomerInfo {
    const all = Object.fromEntries(
        Object.entries(customerInfo.entitlements.all).map(
            ([key, entitlement]) => [
                key,
                {
                    identifier: key,
                    isActive: entitlement.isActive,
                    willRenew: entitlement.willRenew,
                    productIdentifier: entitlement.productIdentifier,
                    expirationDate: entitlement.expirationDate ?? null,
                    expirationDateMillis:
                        entitlement.expirationDateMillis ?? null,
                    billingIssueDetectedAtMillis:
                        entitlement.billingIssueDetectedAtMillis ?? null,
                },
            ],
        ),
    );
    const active = Object.fromEntries(
        Object.entries(customerInfo.entitlements.active).map(
            ([key, entitlement]) => [
                key,
                all[key] ?? {
                    identifier: key,
                    isActive: entitlement.isActive,
                    willRenew: entitlement.willRenew,
                    productIdentifier: entitlement.productIdentifier,
                    expirationDate: entitlement.expirationDate ?? null,
                    expirationDateMillis:
                        entitlement.expirationDateMillis ?? null,
                    billingIssueDetectedAtMillis:
                        entitlement.billingIssueDetectedAtMillis ?? null,
                },
            ],
        ),
    );
    const subscriptionsByProductIdentifier = Object.fromEntries(
        Object.entries(customerInfo.subscriptionsByProductIdentifier).map(
            ([productIdentifier, subscription]) => [
                productIdentifier,
                {
                    productIdentifier,
                    expiresDate: subscription.expiresDate ?? null,
                    gracePeriodExpiresDate:
                        subscription.gracePeriodExpiresDate ?? null,
                } satisfies HostedSubscriptionInfo,
            ],
        ),
    );

    return {
        entitlements: { all, active },
        subscriptionsByProductIdentifier,
        managementUrl: null,
        originalAppUserId:
            (customerInfo as { originalAppUserId?: string | null })
                .originalAppUserId ?? null,
    };
}

interface NativeRevenueCatSdk {
    configure(configuration: { apiKey: string; appUserID?: string }): void;
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

import {
    CustomerInfo,
    ErrorCode,
    LogLevel,
    Offerings,
    Package,
    Purchases,
    PurchasesError,
} from "@revenuecat/purchases-js";

import {
    RevenueCatClient,
    RevenueCatConfigureInput,
    RevenueCatPurchaseResult,
    RevenueCatRestoreResult,
    resolveRevenueCatApiKey,
    toRevenueCatAppUserId,
} from "@/src/hosted/revenuecatCommon";
import {
    HostedCustomerInfo,
    HostedRevenueCatOfferings,
    HostedRevenueCatPackage,
    HostedSubscriptionInfo,
} from "@/src/hosted/revenuecatTypes";
import { recordClientEventError } from "@/src/telemetry/clientEvents";

export function createRevenueCatClientImpl(): RevenueCatClient {
    let configuredApiKey: string | null = null;
    let lastLoggedInAccountId: string | null = null;

    function configure(input: RevenueCatConfigureInput): void {
        const apiKey = resolveRevenueCatApiKey(
            input.publicKeys,
            input.platformOs ?? "web",
        );
        const appUserId =
            input.appUserId === undefined
                ? Purchases.generateRevenueCatAnonymousAppUserId()
                : toRevenueCatAppUserId(input.appUserId);

        Purchases.setLogLevel(LogLevel.Warn);

        if (!Purchases.isConfigured()) {
            Purchases.configure({ apiKey, appUserId });
            configuredApiKey = apiKey;
            lastLoggedInAccountId = appUserId ?? null;
            return;
        }

        if (configuredApiKey !== apiKey) {
            Purchases.getSharedInstance().close();
            Purchases.configure({ apiKey, appUserId });
            configuredApiKey = apiKey;
            lastLoggedInAccountId = appUserId ?? null;
            return;
        }

        if (appUserId !== undefined) {
            lastLoggedInAccountId = appUserId;
        }
    }

    async function logIn(accountId: string): Promise<HostedCustomerInfo> {
        const parsedAccountId = toRevenueCatAppUserId(accountId);
        const purchases = getPurchases();
        if (lastLoggedInAccountId === parsedAccountId) {
            return getCustomerInfo();
        }

        const customerInfo = await runRevenueCatRequest("changeUser", () =>
            purchases.changeUser(parsedAccountId),
        );
        lastLoggedInAccountId = parsedAccountId;
        return normalizeWebCustomerInfo(customerInfo);
    }

    async function getCustomerInfo(): Promise<HostedCustomerInfo> {
        return normalizeWebCustomerInfo(
            await runRevenueCatRequest("getCustomerInfo", () =>
                getPurchases().getCustomerInfo(),
            ),
        );
    }

    async function getOfferings(): Promise<HostedRevenueCatOfferings> {
        return normalizeWebOfferings(
            await runRevenueCatRequest("getOfferings", () =>
                getPurchases().getOfferings(),
            ),
        );
    }

    function addCustomerInfoListener(): () => void {
        return () => {};
    }

    async function restorePurchases(): Promise<RevenueCatRestoreResult> {
        return {
            customerInfo: await getCustomerInfo(),
        };
    }

    async function purchasePackage(
        aPackage: HostedRevenueCatPackage,
    ): Promise<RevenueCatPurchaseResult> {
        try {
            const result = await runRevenueCatRequest("purchasePackage", () =>
                getPurchases().purchasePackage(aPackage.target as Package),
            );
            return {
                customerInfo: normalizeWebCustomerInfo(result.customerInfo),
                productIdentifier: aPackage.product.identifier,
            };
        } catch (error) {
            if (error instanceof PurchasesError) {
                throw new Error(
                    error.errorCode === ErrorCode.UserCancelledError
                        ? "Purchase was cancelled"
                        : error.message,
                );
            }

            throw error;
        }
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

function getPurchases() {
    return Purchases.getSharedInstance();
}

async function runRevenueCatRequest<T>(
    operation: string,
    request: () => Promise<T>,
): Promise<T> {
    try {
        return await request();
    } catch (error) {
        recordClientEventError("revenuecat.web.request_failed", error, {
            operation,
        });
        throw error;
    }
}

function normalizeWebOfferings(
    offerings: Offerings,
): HostedRevenueCatOfferings {
    return {
        current: offerings.current
            ? {
                  identifier: offerings.current.identifier,
                  availablePackages:
                      offerings.current.availablePackages.map(
                          normalizeWebPackage,
                      ),
              }
            : null,
    };
}

function normalizeWebPackage(aPackage: Package): HostedRevenueCatPackage {
    return {
        identifier: aPackage.identifier,
        product: {
            identifier: aPackage.webBillingProduct.identifier,
            title: aPackage.webBillingProduct.title,
            priceString: aPackage.webBillingProduct.price.formattedPrice,
        },
        target: aPackage,
    };
}

function normalizeWebCustomerInfo(
    customerInfo: CustomerInfo,
): HostedCustomerInfo {
    const all = Object.fromEntries(
        Object.entries(customerInfo.entitlements.all).map(
            ([key, entitlement]) => [
                key,
                {
                    identifier: entitlement.identifier,
                    isActive: entitlement.isActive,
                    willRenew: entitlement.willRenew,
                    productIdentifier: entitlement.productIdentifier,
                    expirationDate: toIsoString(entitlement.expirationDate),
                    expirationDateMillis: toMillis(entitlement.expirationDate),
                    billingIssueDetectedAtMillis: toMillis(
                        entitlement.billingIssueDetectedAt,
                    ),
                },
            ],
        ),
    );
    const active = Object.fromEntries(
        Object.entries(customerInfo.entitlements.active).map(
            ([key, entitlement]) => [
                key,
                all[key] ?? {
                    identifier: entitlement.identifier,
                    isActive: entitlement.isActive,
                    willRenew: entitlement.willRenew,
                    productIdentifier: entitlement.productIdentifier,
                    expirationDate: toIsoString(entitlement.expirationDate),
                    expirationDateMillis: toMillis(entitlement.expirationDate),
                    billingIssueDetectedAtMillis: toMillis(
                        entitlement.billingIssueDetectedAt,
                    ),
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
                    expiresDate: toIsoString(subscription.expiresDate),
                    gracePeriodExpiresDate: toIsoString(
                        subscription.gracePeriodExpiresDate,
                    ),
                } satisfies HostedSubscriptionInfo,
            ],
        ),
    );

    return {
        entitlements: { all, active },
        subscriptionsByProductIdentifier,
        managementUrl: customerInfo.managementURL,
        originalAppUserId: customerInfo.originalAppUserId,
    };
}

function toIsoString(value: Date | null): string | null {
    return value ? value.toISOString() : null;
}

function toMillis(value: Date | null): number | null {
    return value ? value.getTime() : null;
}

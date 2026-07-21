interface HostedEntitlementInfo {
    identifier: string;
    isActive: boolean;
    willRenew: boolean;
    productIdentifier: string;
    expirationDate: string | null;
    expirationDateMillis: number | null;
    billingIssueDetectedAtMillis: number | null;
}

export interface HostedSubscriptionInfo {
    productIdentifier: string;
    expiresDate: string | null;
    gracePeriodExpiresDate: string | null;
}

export interface HostedCustomerInfo {
    entitlements: {
        all: Record<string, HostedEntitlementInfo>;
        active: Record<string, HostedEntitlementInfo>;
    };
    subscriptionsByProductIdentifier: Record<string, HostedSubscriptionInfo>;
    managementUrl?: string | null;
    originalAppUserId?: string | null;
}

interface HostedRevenueCatProduct {
    identifier: string;
    title: string;
    priceString: string;
}

export interface HostedRevenueCatPackage {
    identifier: string;
    product: HostedRevenueCatProduct;
    target: unknown;
}

interface HostedRevenueCatOffering {
    identifier: string;
    availablePackages: HostedRevenueCatPackage[];
}

export interface HostedRevenueCatOfferings {
    current: HostedRevenueCatOffering | null;
}

export type HostedCustomerInfoListener = (
    customerInfo: HostedCustomerInfo,
) => void;

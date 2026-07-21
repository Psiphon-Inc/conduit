import { Platform } from "react-native";

import { HostedCatalogPlatform } from "@/src/hosted/contracts";

export function resolveHostedCatalogPlatform(): HostedCatalogPlatform {
    if (Platform.OS === "ios") {
        return "ios";
    }

    if (Platform.OS === "android") {
        return "android";
    }

    return "web";
}

export function supportsLocalConduitExperience(): boolean {
    return Platform.OS === "android";
}

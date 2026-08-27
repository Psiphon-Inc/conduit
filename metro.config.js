// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const {
    wrapWithReanimatedMetroConfig,
} = require("react-native-reanimated/metro-config");
const {
    getBundleModeMetroConfig,
} = require("react-native-worklets/bundleMode");

const revenueCatPurchasesUmdPath = require.resolve("@revenuecat/purchases-js");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.projectRoot = __dirname;
config.watchFolders = [__dirname];
config.server = config.server || {};
config.server.unstable_serverRoot = __dirname;

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === "web" && moduleName === "@revenuecat/purchases-js") {
        return {
            type: "sourceFile",
            filePath: revenueCatPurchasesUmdPath,
        };
    }

    const rewrittenModuleName =
        moduleName === "@noble/hashes/crypto.js"
            ? "@noble/hashes/crypto"
            : moduleName;

    if (originalResolveRequest) {
        return originalResolveRequest(context, rewrittenModuleName, platform);
    }

    return context.resolveRequest(context, rewrittenModuleName, platform);
};

const expoSerializer = config.serializer?.customSerializer;
if (expoSerializer) {
    config.serializer.customSerializer = async (
        entryPoint,
        preModules,
        graph,
        options,
    ) => {
        return expoSerializer(entryPoint, preModules, graph, {
            ...options,
            includeAsyncPaths: false,
        });
    };
}

module.exports = wrapWithReanimatedMetroConfig(
    getBundleModeMetroConfig(config),
);

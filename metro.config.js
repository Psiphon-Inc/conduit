// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.projectRoot = __dirname;
config.watchFolders = [__dirname];
config.server = config.server || {};
config.server.unstable_serverRoot = __dirname;

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
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

// TODO: this is a hack to not bundle all of the @expo/vector-icons fonts
config.resolver.assetExts = config.resolver.assetExts.filter(
    (ext) => ext !== "ttf",
);

module.exports = config;

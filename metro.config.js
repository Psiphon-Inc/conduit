// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// TODO: this is a hack to not bundle all of the @expo/vector-icons fonts
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== "ttf");
config.resolver.assetResolutions

module.exports = config;

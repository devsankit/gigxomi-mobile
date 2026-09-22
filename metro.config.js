const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;
config.resolver.sourceExts = Array.from(new Set([...config.resolver.sourceExts, 'mjs', 'cjs', 'js', 'jsx', 'ts', 'tsx']));

module.exports = config;

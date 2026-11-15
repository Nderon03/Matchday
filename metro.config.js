// Expo's default Metro config, plus one swap to keep the app small: react-native-svg/css (pulled in
// only by the QR code library's unused SVG-logo option) is replaced by src/shims/svg-css.tsx, which
// leaves out a ~600 KB CSS parser.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const shims = { 'react-native-svg/css': path.resolve(__dirname, 'src/shims/svg-css.tsx') };
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (shims[moduleName]) return { type: 'sourceFile', filePath: shims[moduleName] };
  return (resolve ?? context.resolveRequest)(context, moduleName, platform);
};
module.exports = config;

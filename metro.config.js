// Expo's default Metro config, plus a swap to keep the app small and lazy module loading (below): react-native-svg/css (pulled in
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
// Load each module the first time it's used rather than all at launch: less work before the first
// screen appears, which older phones notice most.
config.transformer.getTransformOptions = async () => ({
  transform: { experimentalImportSupport: true, inlineRequires: true },
});
module.exports = config;

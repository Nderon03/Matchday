// Native libraries that come in only as optional companions of expo-router (its drawer and JS stack,
// which this app doesn't use). Nothing imports them, so they're left out of the native build to keep
// the download small. If a future screen needs one, add it to package.json and delete its line here.
const notLinked = { platforms: { android: null, ios: null } };
module.exports = {
  dependencies: {
    'react-native-reanimated': notLinked,
    'react-native-worklets': notLinked,
    'react-native-gesture-handler': notLinked,
  },
};

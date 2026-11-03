// Extends app.json. Values that differ per machine/build come from the environment.
// - updates.url: derived from the EAS project id in app.json.
// - GOOGLE_SERVICES_JSON: path to google-services.json (EAS "file" environment variable), needed for
//   Android push notifications. Falls back to ./google-services.json in the project root if present.
const fs = require('fs');
const path = require('path');

const APP_ID = 'com.matchdayonline.app';

module.exports = ({ config }) => {
  const local = path.resolve('google-services.json');
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? './google-services.json' : undefined);
  // Over-the-air updates: the update server is tied to the EAS project (set by `eas init`).
  // "fingerprint" means an update only reaches builds with the same native code, so a JS update
  // can never land on an app that is missing a native module it needs.
  const projectId = config.extra?.eas?.projectId;
  return {
    ...config,
    runtimeVersion: { policy: 'fingerprint' },
    ...(projectId ? { updates: { ...config.updates, url: `https://u.expo.dev/${projectId}` } } : {}),
    // crash reporting; source-map upload runs only when SENTRY_AUTH_TOKEN is set for the build
    plugins: [...(config.plugins ?? []), ['@sentry/react-native/expo', { organization: 'nderon', project: 'matchday', url: 'https://sentry.io/' }]],
    // Store IDs (permanent once published). app.matchday.* was already taken on Google Play,
    // so both platforms use com.matchdayonline.app.
    ios: { ...config.ios, bundleIdentifier: APP_ID },
    android: {
      ...config.android,
      package: APP_ID,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};

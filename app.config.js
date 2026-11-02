// Extends app.json. Values that differ per machine/build come from the environment.
// - GOOGLE_SERVICES_JSON: path to google-services.json (EAS "file" environment variable), needed for
//   Android push notifications. Falls back to ./google-services.json in the project root if present.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const local = path.resolve('google-services.json');
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? './google-services.json' : undefined);
  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};

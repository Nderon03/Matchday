const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  if (process.env.SKIP_DB_RESET) return;
  execSync(path.join(__dirname, '../../scripts/db-reset-local.sh'), { stdio: 'inherit' });
};

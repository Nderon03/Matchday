// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'supabase/functions/**', 'netlify/edge-functions/**', 'node_modules/*', '.expo/*', 'coverage/*'],
  },
  {
    files: ['tests/**/*.ts', '**/__tests__/**/*.ts', 'jest.config.js', 'tests/**/*.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: { globals: { __dirname: 'readonly', require: 'readonly', module: 'writable', process: 'readonly', console: 'readonly', jest: 'readonly', describe: 'readonly', it: 'readonly', expect: 'readonly', beforeAll: 'readonly', afterAll: 'readonly' } },
  },
]);

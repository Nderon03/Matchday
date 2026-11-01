/** Jest projects: pure domain unit tests, and database integration/security tests. */
const transform = { '^.+\\.[jt]sx?$': 'babel-jest' };
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      transform,
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts', '<rootDir>/supabase/functions/_shared/__tests__/**/*.test.ts'],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
    },
    {
      displayName: 'db',
      testEnvironment: 'node',
      transform,
      testMatch: ['<rootDir>/tests/db/**/*.test.ts'],
      globalSetup: '<rootDir>/tests/db/globalSetup.js',
    },
  ],
};

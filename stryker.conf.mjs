// @ts-check
/** @type {import('@stryker-mutator/api/core').StrykerOptions} */
const config = {
  // Test runner to use
  testRunner: 'vitest',

  // Patterns to ignore (files NOT to include in sandbox)
  ignorePatterns: [
    'src/test/**',
    'src/**/*.d.ts',
    'node_modules/**',
    'coverage/**',
    'reports/**',
    'out/**',
  ],

  // Report types
  reporters: ['html', 'json', 'clear-text'],

  // Concurrency settings
  concurrency: 4,

  // Timeout for test runner (in milliseconds)
  timeoutMS: 30000,

  // Timeout factor for initial test run
  timeoutFactor: 1.25,

  // Mutation settings - files to mutate (exclude test files)
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/test/**',
  ],

  // Explicitly specify test files
  testFiles: ['src/**/*.test.ts'],

  // Specify threshold in percentage
  thresholds: {
    break: 60,
    high: 80,
    low: 40,
  },
};

export default config;

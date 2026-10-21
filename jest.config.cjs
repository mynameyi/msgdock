module.exports = {
  testEnvironment: 'node', testMatch: ['<rootDir>/packages/**/*.spec.ts', '<rootDir>/plugins/**/*.spec.ts'],
  moduleNameMapper: {
    '^@msgdock/plugin-sdk$': '<rootDir>/packages/plugin-sdk/src',
    '^@msgdock/plugin-(.*)$': '<rootDir>/plugins/$1/src',
    '^@msgdock/(.*)$': '<rootDir>/packages/$1/src',
  },
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.base.json' }] },
  collectCoverageFrom: ['packages/channels/src/**/*.ts','plugins/*/src/**/*.ts','packages/server/src/modules/deliveries/policy.ts'],
};

module.exports = {
  testEnvironment: 'node', testMatch: ['<rootDir>/packages/**/*.spec.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.base.json' }] },
  collectCoverageFrom: ['packages/channels/src/**/*.ts','packages/server/src/modules/deliveries/policy.ts'],
};

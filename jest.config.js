export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js'],
    collectCoverageFrom: ['src/**/*.ts'],
    coverageDirectory: 'coverage',
    verbose: true,
};

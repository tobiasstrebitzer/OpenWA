module.exports = {
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/**/*.spec.ts'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 12,
      lines: 15,
      statements: 15,
    },
  },
  projects: [
    {
      displayName: 'unit',
      rootDir: 'src',
      testEnvironment: 'node',
      moduleFileExtensions: ['js', 'json', 'ts'],
      testRegex: '.*\\.spec\\.ts$',
      // ESM specs are handled by the `esm` project below.
      testPathIgnorePatterns: ['\\.esm\\.spec\\.ts$'],
      transform: {
        '^.+\\.(t|j)s$': 'ts-jest',
      },
    },
    {
      displayName: 'esm',
      rootDir: 'src',
      testEnvironment: 'node',
      moduleFileExtensions: ['js', 'json', 'ts', 'mjs'],
      testRegex: '.*\\.esm\\.spec\\.ts$',
      extensionsToTreatAsEsm: ['.ts'],
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            useESM: true,
            tsconfig: { module: 'ESNext', moduleResolution: 'Bundler' },
          },
        ],
      },
    },
  ],
};

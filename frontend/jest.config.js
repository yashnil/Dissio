/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  // Only run tests in src/__tests__ (pure helpers — no React/DOM needed)
  testMatch: ["<rootDir>/src/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    // Map @/* to src/* to match tsconfig paths
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.jest.json",
        diagnostics: { ignoreCodes: ["TS151001"] },
      },
    ],
  },
  // Ignore Next.js build artifacts
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
};

module.exports = config;

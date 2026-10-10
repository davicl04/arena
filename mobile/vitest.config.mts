import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    env: { EXPO_PUBLIC_API_URL: 'http://10.0.2.2:8000' },
    include: ['tests/**/*.test.ts'],
    reporters: ['default', 'junit'],
    outputFile: { junit: '../artifacts/coverage/mobile/tests.xml' },
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['App.tsx', 'src/**/*.{ts,tsx}'],
      reportsDirectory: '../artifacts/coverage/mobile',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      thresholds: {
        statements: 10, lines: 15, branches: 8, functions: 10,
        'src/api/client.ts': { statements: 100, lines: 100, branches: 90, functions: 100 },
      },
    },
  },
})

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // O NativeWind só processa classes no Metro; nos testes, `styled` vira identidade. O react-native-svg e o safe-area-context
  // trazem sintaxe Flow que o Node não lê (e o reanimated e o expo-secure-store dependem do runtime nativo): os testes usam as
  // simulações de tests/support (um vi.mock próprio ainda vale).
  resolve: {
    alias: {
      nativewind: fileURLToPath(new URL('./tests/support/nativewind.ts', import.meta.url)),
      'react-native-svg': fileURLToPath(new URL('./tests/support/svg.ts', import.meta.url)),
      'react-native-safe-area-context': fileURLToPath(new URL('./tests/support/safe-area.ts', import.meta.url)),
      'react-native-reanimated': fileURLToPath(new URL('./tests/support/reanimated.ts', import.meta.url)),
      'expo-secure-store': fileURLToPath(new URL('./tests/support/secure-store.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    env: { EXPO_PUBLIC_API_URL: 'http://10.0.2.2:8000' },
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/support/setup.ts'],
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
        // Clientes da API (transporte, contratos e regras espelhadas do servidor): cada arquivo com piso próprio.
        'src/api/**/*.ts': { perFile: true, statements: 100, lines: 100, branches: 90, functions: 100 },
      },
    },
  },
})

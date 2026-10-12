import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    env: { VITE_API_URL: 'http://localhost:8000' },
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    // Os fluxos longos (assistentes, ArenaPage inteira) levam de 1 a 4 s com a máquina ocupada; 5 s era o limite padrão.
    testTimeout: 20000,
    hookTimeout: 20000,
    reporters: ['default', 'junit'],
    outputFile: { junit: '../artifacts/coverage/web/tests.xml' },
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx'],
      reportsDirectory: '../artifacts/coverage/web',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      thresholds: {
        statements: 30, lines: 30, branches: 30, functions: 20,
        'src/api/client.ts': { statements: 100, lines: 100, branches: 90, functions: 100 },
      },
    },
  },
})

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Keep vitest away from the Playwright specs in e2e/.
  test: { include: ['src/**/*.test.ts'] },
})

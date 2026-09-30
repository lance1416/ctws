import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // Read VITE_* variables from the repo-root .env, the single env file of the project.
  envDir: '../..',
  // strictPort: fail loudly instead of drifting to another port Playwright is not watching.
  server: { port: 5173, strictPort: true },
  // Keep vitest away from the Playwright specs in e2e/.
  test: { include: ['src/**/*.test.{ts,tsx}'] },
})

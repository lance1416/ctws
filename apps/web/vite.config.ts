import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Read VITE_* variables from the repo-root .env, the single env file of the project.
  envDir: '../..',
  // strictPort: fail loudly instead of drifting to a port other tooling does not expect.
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in development too: the browser only talks to Vite, which forwards /api to the
    // API. Matches the deployed topology (the API serves the built app), so no CORS in dev.
    proxy: { '/api': 'http://localhost:3000' },
  },
  // Keep vitest away from the Playwright specs in e2e/.
  test: { include: ['src/**/*.test.{ts,tsx}'] },
})

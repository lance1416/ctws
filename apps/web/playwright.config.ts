import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    // 127.0.0.1 and localhost are different *sites*, so the web app (here) and the API
    // (http://localhost:3000) are genuinely cross-site: the SameSite=None; Secure cookie path
    // of the production topology is what gets exercised.
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    // In CI never adopt a stray server already on the port; locally reusing your own is fine.
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})

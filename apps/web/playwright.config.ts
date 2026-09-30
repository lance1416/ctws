import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    // In CI never adopt a stray server already on the port; locally reusing your own is fine.
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})

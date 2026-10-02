import { defineConfig } from '@playwright/test'

// The e2e runs against the real image: the API container serves the built web app, so the page
// and the API share one origin, exactly like the deployed topology. There is no dev server here;
// start the stack first (see CONTRIBUTING.md).
export default defineConfig({
  testDir: './e2e',
  // One API container and one Postgres serve every worker; the default (half the cores) swamps them.
  workers: 4,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
})

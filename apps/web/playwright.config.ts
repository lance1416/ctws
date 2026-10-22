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
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'app',
      testIgnore: /\.pinned\.spec\.ts$/,
      use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' },
    },
    {
      // The specs whose answer depends on what time it is, against the app whose clock is pinned
      // (`api-pinned` in docker-compose.yml): their expectations come from `e2e/pinned.ts`.
      name: 'pinned',
      testMatch: /\.pinned\.spec\.ts$/,
      use: { baseURL: process.env.E2E_PINNED_URL ?? 'http://localhost:3001' },
    },
  ],
})

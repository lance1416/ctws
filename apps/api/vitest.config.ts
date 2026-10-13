import { defineConfig } from 'vitest/config'

// One Testcontainers Postgres per run (started in globalSetup), with a database clone per test.
// The timeouts cover a cold CI runner pulling the image on first start.
export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    globalSetup: ['./tests/helpers/global-setup.ts'],
  },
})

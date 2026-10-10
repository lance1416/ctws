import { defineConfig } from 'vitest/config'

// Tests share ONE Testcontainers Postgres per run (started in globalSetup) and take a database
// clone each, so the suite runs alongside the compose stack instead of fighting it for resources.
// The timeouts are for a cold CI runner (image pull, ryuk, slower CPU), which easily exceeds
// Vitest's 5s default on that one startup.
export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    globalSetup: ['./tests/helpers/global-setup.ts'],
  },
})

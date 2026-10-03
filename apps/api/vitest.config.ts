import { defineConfig } from 'vitest/config'

// Tests share one Testcontainers Postgres per run (started in globalSetup), which on a cold CI
// runner (image pull, ryuk, slower CPU) easily exceeds Vitest's 5s default. migration-promote.test.ts
// still starts its own container inside the test body.
export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    globalSetup: ['./tests/helpers/global-setup.ts'],
  },
})

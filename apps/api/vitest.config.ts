import { defineConfig } from 'vitest/config'

// Tests start Testcontainers Postgres instances (some inside the test body), which on a cold CI
// runner (image pull, ryuk, slower CPU) easily exceeds Vitest's 5s default.
export default defineConfig({
  test: { testTimeout: 120_000, hookTimeout: 120_000 },
})

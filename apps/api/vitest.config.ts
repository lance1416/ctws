import { defineConfig } from 'vitest/config'

// Two projects: `unit` is the tests beside the source, which need no database; `db` is
// apps/api/tests, with one Testcontainers Postgres per run (started in globalSetup) and a database
// clone per test. Its timeouts cover a cold CI runner pulling the image on first start.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['src/**/*.test.ts'] } },
      {
        test: {
          name: 'db',
          include: ['tests/**/*.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
          globalSetup: ['./tests/helpers/global-setup.ts'],
        },
      },
    ],
  },
})

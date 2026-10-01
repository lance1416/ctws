import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { closeDb, createDb } from './client'

// Source layout: src/db/migrate.ts -> ../../drizzle. Bundled layout: dist/db/migrate.js -> ../../drizzle too
// (tsup keeps the src/ subdirectory), and ../drizzle is tried as a fallback for a flat bundle.
// MIGRATIONS_DIR overrides both.
function resolveMigrationsFolder(): string {
  const override = process.env.MIGRATIONS_DIR
  if (override) return override
  const candidates = ['../../drizzle', '../drizzle'].map((p) =>
    fileURLToPath(new URL(p, import.meta.url)),
  )
  const found = candidates.find((dir) => existsSync(dir))
  if (!found) {
    throw new Error(
      `Migrations folder not found; tried ${candidates.join(', ')}. Set MIGRATIONS_DIR.`,
    )
  }
  return found
}

export async function runMigrations(connectionString: string): Promise<void> {
  const db = createDb(connectionString)
  try {
    await migrate(db, { migrationsFolder: resolveMigrationsFolder() })
  } finally {
    await closeDb(db)
  }
}

// Allow running directly as a script: pnpm --filter @ctws/api db:migrate
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  await runMigrations(url)
}

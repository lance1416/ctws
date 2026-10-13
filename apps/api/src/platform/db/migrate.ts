import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { closeDb, createDb } from './client'

// Source layout: src/platform/db/migrate.ts -> ../../../drizzle. The image sets MIGRATIONS_DIR.
function resolveMigrationsFolder(): string {
  const override = process.env.MIGRATIONS_DIR
  if (override) return override
  const dir = fileURLToPath(new URL('../../../drizzle', import.meta.url))
  if (!existsSync(dir)) throw new Error(`Migrations folder not found at ${dir}. Set MIGRATIONS_DIR.`)
  return dir
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

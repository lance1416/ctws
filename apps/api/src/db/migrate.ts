import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { closeDb, createDb } from './client'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

export async function runMigrations(connectionString: string): Promise<void> {
  const db = createDb(connectionString)
  try {
    await migrate(db, { migrationsFolder })
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

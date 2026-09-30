import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema> & { $pool: Pool }

export function createDb(connectionString: string): Db {
  const pool = new Pool({ connectionString })
  const db = drizzle(pool, { schema }) as unknown as Db
  db.$pool = pool
  return db
}

export async function closeDb(db: Db): Promise<void> {
  await db.$pool.end()
}

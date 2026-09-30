import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema> & { $client: Pool }

export function createDb(connectionString: string): Db {
  return drizzle(new Pool({ connectionString }), { schema })
}

export async function closeDb(db: Db): Promise<void> {
  await db.$client.end()
}

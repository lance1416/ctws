import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export type Db = NodePgDatabase & { $client: Pool }

export function createDb(connectionString: string): Db {
  return drizzle(new Pool({ connectionString }))
}

export async function closeDb(db: Db): Promise<void> {
  await db.$client.end()
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** A service works the same on the pool and inside a caller's transaction. */
export type Queryable = Db | Tx

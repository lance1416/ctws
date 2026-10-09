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

/**
 * The transaction handle drizzle hands to a `db.transaction` callback.
 * Derived from drizzle's own signature so it cannot drift from the installed version.
 */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * What every service function takes. A service must work both standalone and composed inside
 * a caller's transaction, because spec section 9.5 requires each write to append its event in
 * the same transaction as the mutation. `Db` alone cannot express that: a `Tx` is not
 * assignable to `Db`, which carries `$client: Pool`.
 */
export type Queryable = Db | Tx

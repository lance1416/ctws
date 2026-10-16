import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { type CustomTypesConfig, Pool, types } from 'pg'

export type Db = NodePgDatabase & { $client: Pool }

/**
 * A `date` is a calendar day, not an instant, so it stays the `YYYY-MM-DD` Postgres sends. Read as
 * a Date it would be midnight in the server's zone, a day early once written out in UTC west of
 * Greenwich. Set here once, so no query has to cast a day to text.
 */
const typeParsers: CustomTypesConfig = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
    oid === types.builtins.DATE
      ? (value: string) => value
      : types.getTypeParser(oid, format)) as CustomTypesConfig['getTypeParser'],
}

export function createDb(connectionString: string): Db {
  return drizzle(new Pool({ connectionString, types: typeParsers }))
}

export async function closeDb(db: Db): Promise<void> {
  await db.$client.end()
}

/**
 * An open transaction. A lock, or a write that must land with others, takes this rather than
 * `Queryable`: on the pool a lock is released as soon as its statement ends.
 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** A service works the same on the pool and inside a caller's transaction. */
export type Queryable = Db | Tx

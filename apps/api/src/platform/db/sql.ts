import { sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

// `!` rather than `\`: a backslash also escapes inside string literals under some server settings.
const LIKE_ESCAPE = '!'

/** A case-insensitive containment pattern with LIKE's wildcards escaped. */
export function likePattern(query: string): string {
  const escaped = query.replace(/[!%_]/g, (c) => LIKE_ESCAPE + c)
  return `%${escaped}%`
}

/** `<column> ilike <pattern>` for each column, OR-ed. A column may be table-qualified. */
export function textMatches(columns: readonly string[], query: string): SQL {
  const pattern = likePattern(query)
  const clauses = columns.map((column) => {
    const name = sql.join(column.split('.').map(ident), sql`.`)
    return sql`${name} ilike ${pattern} escape ${LIKE_ESCAPE}`
  })
  return clauses.length === 1 ? clauses[0]! : sql`(${sql.join(clauses, sql` or `)})`
}

/** A table alias or column name interpolated raw, so it must be a plain lower-case identifier. */
export function ident(name: string): SQL {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`not an identifier: ${name}`)
  return sql.raw(name)
}

/** `<column> in (...)` over literal values, for CHECK constraints built from a contract's list. */
export const inList = (column: AnyPgColumn, values: readonly string[]): SQL =>
  sql`${column} in (${sql.join(
    values.map((v) => sql.raw(`'${v}'`)),
    sql`, `,
  )})`

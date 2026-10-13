import { sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

// `!` rather than `\`: a backslash also escapes inside string literals under some server settings.
const LIKE_ESCAPE = '!'

/** A case-insensitive containment pattern with LIKE's wildcards escaped. */
export function likePattern(query: string): string {
  const escaped = query.replace(/[!%_]/g, (c) => LIKE_ESCAPE + c)
  return `%${escaped}%`
}

/**
 * `<column> ilike <pattern>` for each column, OR-ed. Column names are interpolated raw, so each
 * must be a plain or table-qualified identifier.
 */
export function textMatches(columns: readonly string[], query: string): SQL {
  const pattern = likePattern(query)
  const clauses = columns.map((column) => {
    if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/.test(column)) {
      throw new Error(`not a column name: ${column}`)
    }
    return sql`${sql.raw(column)} ilike ${pattern} escape ${LIKE_ESCAPE}`
  })
  return clauses.length === 1 ? clauses[0]! : sql`(${sql.join(clauses, sql` or `)})`
}

/** `<column> in (...)` over literal values, for CHECK constraints built from a contract's list. */
export const inList = (column: AnyPgColumn, values: readonly string[]): SQL =>
  sql`${column} in (${sql.join(
    values.map((v) => sql.raw(`'${v}'`)),
    sql`, `,
  )})`

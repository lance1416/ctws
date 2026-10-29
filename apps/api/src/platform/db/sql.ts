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
 * How well `title` answers `query` (FR-024): 0 when it starts with it, 1 when one of its words
 * does, 2 when it only has it inside. `alsoStarts`, when given, counts as a start too (an alias).
 */
export function matchTier(title: SQL | AnyPgColumn, query: string, alsoStarts?: SQL): SQL {
  const escaped = query.replace(/[!%_]/g, (c) => LIKE_ESCAPE + c)
  const start = sql`${title} ilike ${`${escaped}%`} escape ${LIKE_ESCAPE}`
  const word = sql`${title} ilike ${`% ${escaped}%`} escape ${LIKE_ESCAPE}`
  return sql`case when ${alsoStarts ? sql`(${start} or ${alsoStarts})` : start} then 0
    when ${word} then 1 else 2 end`
}

/** Whether some value of `column` starts with `query`, case aside: for `matchTier`'s alias. */
export function startsWith(column: string, query: string): SQL {
  const escaped = query.replace(/[!%_]/g, (c) => LIKE_ESCAPE + c)
  const name = sql.join(column.split('.').map(ident), sql`.`)
  return sql`${name} ilike ${`${escaped}%`} escape ${LIKE_ESCAPE}`
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

const MAX_CAUSE_DEPTH = 5

/**
 * An error and its `cause`s, capped so a cycle cannot loop. drizzle wraps the driver error, so
 * the Postgres SQLSTATE sits on a `cause`.
 */
export function causeChain(error: unknown): { code?: unknown; cause?: unknown }[] {
  const chain: { code?: unknown; cause?: unknown }[] = []
  let current = error
  while (chain.length < MAX_CAUSE_DEPTH && typeof current === 'object' && current !== null) {
    const link = current as { code?: unknown; cause?: unknown }
    chain.push(link)
    current = link.cause
  }
  return chain
}

/** A unique violation (SQLSTATE 23505) anywhere in the cause chain. */
export const isUniqueViolation = (error: unknown): boolean =>
  causeChain(error).some((e) => e.code === '23505')

/** A CHECK constraint violation (SQLSTATE 23514) anywhere in the cause chain. */
export const isCheckViolation = (error: unknown): boolean =>
  causeChain(error).some((e) => e.code === '23514')

/**
 * Values from a contract's list as SQL literals, comma-separated: what goes between the brackets
 * of an `in (...)`. Only for values the code names, never for input, which goes as a parameter.
 */
export const sqlValues = (values: readonly (string | number)[]): SQL =>
  sql.join(
    values.map((v) => sql.raw(typeof v === 'number' ? String(v) : `'${v.replaceAll("'", "''")}'`)),
    sql`, `,
  )

/** `<column> in (...)` over a contract's list; CHECK constraints need literals, not parameters. */
export const inList = (column: AnyPgColumn, values: readonly (string | number)[]): SQL =>
  sql`${column} in (${sqlValues(values)})`

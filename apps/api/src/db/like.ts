import { sql, type SQL } from 'drizzle-orm'

/**
 * LIKE patterns, for every module that searches text.
 *
 * Not task semantics and not reading semantics -- it is how this codebase talks to Postgres, which
 * is the shell's. A module with its own copy would be a second place to get the escape character
 * wrong.
 */

/**
 * The escape character for a LIKE pattern. Backslash is the obvious choice and the wrong one: it
 * is also an escape inside a SQL string literal under non-standard-conforming settings, so the
 * `escape` clause would read differently depending on a server setting. `!` has no other meaning
 * in either language.
 */
const LIKE_ESCAPE = '!'

/**
 * Turns a user's words into one case-insensitive containment pattern. Without this, a query of
 * `100%` matches every row (`%` is LIKE's wildcard) and `a_b` matches `axb` -- a search that
 * silently returns the wrong rows rather than none.
 */
export function likePattern(query: string): string {
  const escaped = query.replace(/[!%_]/g, (c) => LIKE_ESCAPE + c)
  return `%${escaped}%`
}

/**
 * `<column> ilike <pattern> escape '!'` for one column, and the OR of several.
 *
 * The clause was written out by hand in seven files and eighteen places. Forgetting the `escape`
 * is not a syntax error and not a crash: it is a search that silently returns the wrong rows,
 * which is the exact failure `likePattern` above exists to prevent and which a reader has no way
 * to notice in a diff. One spelling, one place.
 *
 * COLUMNS ARE INTERPOLATED RAW, because a column name is not a value and `sql` would bind it as
 * one. Every caller passes a literal, and the shape is checked here so a dynamic one cannot slip
 * through: an identifier, optionally qualified, and nothing else.
 */
export function textMatches(columns: readonly string[], query: string): SQL {
  const pattern = likePattern(query)
  const clauses = columns.map((column) => {
    if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/.test(column)) {
      throw new Error(`not a column name: ${column}`)
    }
    return sql`${sql.raw(column)} ilike ${pattern} escape ${LIKE_ESCAPE}`
  })
  // A single column needs no parentheses, and the OR of several always does: this fragment is
  // dropped into a larger `where` beside other conditions.
  return clauses.length === 1 ? clauses[0]! : sql`(${sql.join(clauses, sql` or `)})`
}

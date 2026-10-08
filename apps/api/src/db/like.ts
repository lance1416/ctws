/**
 * LIKE patterns, for every module that searches text.
 *
 * This started inside the task module and moved here the day a second module needed it. It is
 * not task semantics and it is not reading semantics -- it is how this codebase talks to
 * Postgres, which is the shell's (module-boundary contract §3). A module copying it would have
 * been two places to get the escape character wrong.
 */

/**
 * The escape character for a LIKE pattern. Backslash is the obvious choice and the wrong one: it
 * is also an escape inside a SQL string literal under non-standard-conforming settings, so the
 * `escape` clause would read differently depending on a server setting. `!` has no other meaning
 * in either language.
 */
export const LIKE_ESCAPE = '!'

/**
 * Turns a user's words into one case-insensitive containment pattern. Without this, a query of
 * `100%` matches every row (`%` is LIKE's wildcard) and `a_b` matches `axb` -- a search that
 * silently returns the wrong rows rather than none.
 */
export function likePattern(query: string): string {
  const escaped = query.replace(/[!%_]/g, (c) => LIKE_ESCAPE + c)
  return `%${escaped}%`
}

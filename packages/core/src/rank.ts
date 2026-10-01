import { BASE_62_DIGITS, generateKeyBetween } from 'fractional-indexing'

// base62 in strict ASCII order (0-9 < A-Z < a-z). Lexicographic order of keys equals logical
// order only if the alphabet is ASCII-sorted, and only if the database compares bytewise:
// the rank column must use COLLATE "C", otherwise Postgres' locale collation reorders case.
//
// Exported although no production code reads it: it is the first half of that claim, and it is
// asserted beside the second half in apps/api/tests/task-schema.test.ts, next to the COLLATE "C"
// assertion. Deleting it would take this rationale with it, so if it ever has to go, the comment
// moves to `rankBetween` and the test is rewritten against a literal alphabet.
export const RANK_ALPHABET: string = BASE_62_DIGITS

/**
 * Returns a key strictly between `before` and `after` (either may be null for "no neighbour").
 * Keys grow in length as needed, so any two adjacent keys always have room between them and
 * a reorder only ever writes the moved row.
 *
 * Throws unless before < after. The underlying library silently swaps a reversed pair, which
 * would hide a caller bug, so ordering is checked here. Equal ranks are legal in storage
 * (ties break on id) but have no key strictly between them, so they are rejected too.
 */
export function rankBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) {
    throw new Error(`rankBetween requires before < after, got "${before}" and "${after}"`)
  }
  return generateKeyBetween(before, after)
}

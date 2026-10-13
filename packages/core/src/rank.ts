import { generateKeyBetween } from 'fractional-indexing'

/**
 * A fractional-index key strictly between `before` and `after` (either may be null for "no neighbour").
 * Keys grow in length as needed, so any two adjacent keys always have room between them and
 * a reorder only ever writes the moved row. Keys are ASCII base62 and sort correctly only where
 * the column compares bytewise (COLLATE "C").
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

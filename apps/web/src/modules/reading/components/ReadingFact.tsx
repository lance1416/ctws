import type { LinkCandidate } from '@ctws/contracts'

/** A reading item listed among things of every kind: its author, or nothing (DES-001 section 4). */
export function ReadingFact({ thing }: { thing: LinkCandidate }) {
  return thing.type === 'reading' && thing.author ? (
    <span className="truncate">{thing.author}</span>
  ) : null
}

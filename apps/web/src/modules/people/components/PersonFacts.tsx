import type { LinkCandidate } from '@ctws/contracts'
import { Avatar } from '../../../platform/ui/Avatar'
import { KIND_ICON } from '../../../platform/ui/icons'

/** A person listed among things of every kind: their avatar, in the first column. */
export function PersonMark({ thing }: { thing: LinkCandidate }) {
  return thing.type === 'person' ? <Avatar initials={thing.initials} /> : null
}

/**
 * Where a person works now (DES-001 section 4, artboard 9): the building and the organisation of
 * their current role; nothing with no current role. Email, phone and projects stay on their page.
 */
export function PersonFact({ thing }: { thing: LinkCandidate }) {
  if (thing.type !== 'person' || !thing.org) return null
  const Building = KIND_ICON.organisation
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Building size={14} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{thing.org}</span>
    </span>
  )
}

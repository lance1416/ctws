import type { LinkCandidate, ObjectType } from '@ctws/contracts'
import { SearchDialog, type Pick } from './SearchDialog'

/**
 * ONE THING PICKED FOR A JOB (FR-024): the link picker, the search box with its keys, offering one
 * kind and leaving out what is no answer (the thing itself, where it already is). Picking is the
 * whole act: no line of why. Move to… and Waiting on's Add are this.
 */
export function PickThing({
  of,
  title,
  only,
  leaveOut,
  busy,
  error,
  onPick,
  onClose,
  drill,
  first = null,
}: {
  /** What it is picked for; null for a thing not made yet. */
  of: { type: ObjectType; id: string } | null
  /** The dialog's head: what the pick is for ("Move “X” to"). */
  title: string
  only: ObjectType
  leaveOut: readonly string[]
  busy: boolean
  error: string | null
  onPick: (thing: LinkCandidate) => void
  onClose: () => void
  drill?: Pick['drill']
  /** Offered before the rest, when the words find it. */
  first?: string | null
}) {
  return (
    <SearchDialog
      onClose={onClose}
      pick={{
        of,
        title,
        only,
        asksWhy: false,
        leaveOut,
        busy,
        first,
        error,
        onPick,
        ...(drill ? { drill } : {}),
      }}
    />
  )
}

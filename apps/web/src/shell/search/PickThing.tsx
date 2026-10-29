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
}: {
  of: { type: ObjectType; id: string }
  /** The dialog's head: what the pick is for ("Move “X” to"). */
  title: string
  only: ObjectType
  leaveOut: readonly string[]
  busy: boolean
  error: string | null
  onPick: (thing: LinkCandidate) => void
  onClose: () => void
  drill?: Pick['drill']
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
        error,
        onPick,
        ...(drill ? { drill } : {}),
      }}
    />
  )
}

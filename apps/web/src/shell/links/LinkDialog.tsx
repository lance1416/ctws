import { type LinkCandidate, OBJECT_TYPES, type ObjectType } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { SearchDialog } from '../search/SearchDialog'
import { createLink, linkKeys, type Endpoint } from './api'

/**
 * How a new thing of the picker's one kind is made from the words typed (FR-055): `run` takes
 * them on, to a form of its own, which links what it makes.
 */
export type Makes = { label: string; run: (name: string) => void }

/**
 * LINK (FR-027, artboard 9): one action on anything, `L`. The picker is the search box at 380,
 * scoped with `/` or by the block it was opened from; the chosen row stays lit while one line of
 * why is written at its foot, which Enter skips.
 */

export function LinkDialog({
  of,
  only,
  makes,
  onClose,
}: {
  of: Endpoint & { title?: string }
  /** Offer things of this one kind: the `+` on a kind's own block relates one of that kind. */
  only?: ObjectType | undefined
  /** The last row makes one under the words typed (FR-055): "New organisation". */
  makes?: Makes | undefined
  onClose: () => void
}) {
  const make = useMutation({
    mutationFn: async ({ to, why }: { to: LinkCandidate; why: string | null }) =>
      createLink({
        from: { type: of.type, id: of.id },
        to: { type: to.type, id: to.id },
        ...(why ? { note: why } : {}),
      }),
    // Both ends show the relation, and the far one can be any kind of thing.
    meta: { changes: OBJECT_TYPES, awaits: [linkKeys.all], ownsError: true },
    onSuccess: onClose,
  })
  return (
    <SearchDialog
      onClose={onClose}
      pick={{
        // The endpoint only: the query is strict, and the subject carries its title too.
        of: { type: of.type, id: of.id },
        title: of.title ? `Link to ${of.title}` : 'Link to',
        only,
        onPick: (to, why) => make.mutate({ to, why }),
        busy: make.isPending,
        // Never the server's own words: they name fields, not what happened (BUG-016).
        error: make.isError ? 'Couldn’t link those. Try again.' : null,
        ...(makes && only
          ? {
              makes: {
                label: makes.label,
                run: (name: string) => {
                  onClose()
                  makes.run(name)
                },
              },
            }
          : {}),
      }}
    />
  )
}

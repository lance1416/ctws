import { type LinkCandidate, OBJECT_TYPES, type ObjectType } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { problemText } from '../../platform/http/api'
import { BUTTON, KEY_ON_INK } from '../../platform/ui/buttonStyles'
import { boxed } from '../../platform/ui/formStyles'
import { KIND_ICON } from '../../platform/ui/icons'
import { Modal } from '../../platform/ui/Modal'
import { KIND_TEXT } from '../layout/places'
import { SearchDialog } from '../search/SearchDialog'
import { createLink, linkKeys, type Endpoint } from './api'

/**
 * LINK (FR-027): one action on anything, `L`. The picker is the search box, scoped with `/` or by
 * the block it was opened from; then one line of why, which Enter skips.
 */
export function LinkDialog({
  of,
  only,
  onClose,
}: {
  of: Endpoint & { title?: string }
  /** Offer things of this one kind: the `+` on a kind's own block relates one of that kind. */
  only?: ObjectType | undefined
  onClose: () => void
}) {
  const [chosen, setChosen] = useState<LinkCandidate | null>(null)
  if (chosen === null)
    return (
      <SearchDialog
        onClose={onClose}
        pick={{
          // The endpoint only: the query is strict, and the subject carries its title too.
          of: { type: of.type, id: of.id },
          title: of.title ? `Link to ${of.title}` : 'Link to',
          only,
          onPick: setChosen,
        }}
      />
    )
  return <Why of={of} to={chosen} onBack={() => setChosen(null)} onClose={onClose} />
}

function Why({
  of,
  to,
  onBack,
  onClose,
}: {
  of: Endpoint
  to: LinkCandidate
  onBack: () => void
  onClose: () => void
}) {
  const [note, setNote] = useState('')
  const box = useRef<HTMLInputElement>(null)
  const make = useMutation({
    mutationFn: async () =>
      createLink({
        from: of,
        to: { type: to.type, id: to.id },
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    // Both ends show the relation, and the far one can be any kind of thing.
    meta: { changes: OBJECT_TYPES, awaits: [linkKeys.all], ownsError: true },
    onSuccess: onClose,
  })
  const Icon = KIND_ICON[to.type]
  return (
    <Modal title="Link" onClose={onClose} initialFocus={box} dismissLabel={null}>
      <div className="flex flex-col gap-3 px-5 py-4">
        <p className="flex items-center gap-2 text-ui text-ink">
          <Icon size={16} aria-hidden="true" className={KIND_TEXT[to.type]} />
          <span className="font-medium">{to.title}</span>
        </p>
        <input
          ref={box}
          value={note}
          aria-label="Why"
          placeholder="Why, in a line (optional)"
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !make.isPending) {
              e.preventDefault()
              make.mutate()
            }
          }}
          className={`w-full ${boxed}`}
        />
        {make.isError && (
          <p role="alert" className="text-ui text-stop-t">
            {problemText(make.error) ?? "Couldn't link those"}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => make.mutate()}
            disabled={make.isPending}
            className={BUTTON.primary}
          >
            Link
            <kbd className={KEY_ON_INK}>Enter</kbd>
          </button>
          <button type="button" onClick={onBack} className={BUTTON.quiet}>
            Back
          </button>
          <button type="button" onClick={onClose} className={BUTTON.quiet}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

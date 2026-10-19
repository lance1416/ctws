import { problemText } from '../../platform/http/api'
import { type LinkCandidate, OBJECT_TYPES, type ObjectType } from '@ctws/contracts'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { candidatesQuery, createLink, type Endpoint, linkKeys } from './api'
import { useRegistry } from '../registry'
import { Modal } from '../../platform/ui/Modal'
import { Button } from '../../platform/ui/Button'
import { useDebouncedValue } from '../../platform/time/useDebouncedValue'

/** Relates two things: pick what, say why if you like (FR-027). No kind to choose. */
export function AddLink({
  of,
  only,
  onClose,
}: {
  of: Endpoint
  /** Offer things of this one kind: the `+` on a kind's own block relates one of that kind. */
  only?: ObjectType | undefined
  onClose: () => void
}) {
  const registry = useRegistry()
  const box = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState('')
  const [chosen, setChosen] = useState<LinkCandidate | null>(null)
  const [note, setNote] = useState('')

  const asked = useDebouncedValue(typed.trim())
  // While the words change, the last answer stays up rather than a blank or "Nothing matches".
  const candidates = useQuery({
    ...candidatesQuery(of, asked),
    enabled: chosen === null,
    placeholderData: keepPreviousData,
  })
  const make = useMutation({
    mutationFn: async () =>
      createLink({
        from: of,
        to: { type: chosen!.type, id: chosen!.id },
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    // Both ends show the relation, and the far one can be any kind of thing.
    meta: { changes: OBJECT_TYPES, awaits: [linkKeys.all], ownsError: true },
    onSuccess: onClose,
  })

  const offered = (candidates.data ?? []).filter((c) => !only || c.type === only)

  return (
    <Modal
      title={chosen ? 'Link' : 'Link to…'}
      onClose={onClose}
      initialFocus={box}
      dismissLabel={null}
    >
      {chosen === null ? (
        <div className="flex flex-col">
          <div className="border-b border-rule px-4 py-2">
            <input
              ref={box}
              value={typed}
              aria-label="Search"
              placeholder="Search for anything"
              onChange={(e) => setTyped(e.target.value)}
              className="h-9 w-full bg-transparent text-ink placeholder:text-ink-muted"
            />
          </div>
          {candidates.isError && (
            <p role="alert" className="px-4 py-3 text-sm text-danger">
              Couldn't search. Check that the server is running.
            </p>
          )}
          {candidates.isSuccess && !candidates.isPlaceholderData && offered.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink-muted">Nothing matches</p>
          )}
          <ul className="max-h-80 overflow-y-auto py-1">
            {offered.map((c) => {
              const where = registry.relationFor(c.type)
              const detail = where.describe?.(c) ?? null
              return (
                <li key={`${c.type}:${c.id}`}>
                  <button
                    type="button"
                    onClick={() => setChosen(c)}
                    data-candidate={c.id}
                    className="flex w-full min-w-0 items-baseline gap-2 px-4 py-1.5 text-left text-sm text-ink hover:bg-hover"
                  >
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    {detail && (
                      <span className="min-w-0 shrink truncate text-xs text-ink-muted">
                        {detail}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-ink-subtle">{where.kind}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-5 py-4">
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{chosen.title}</span>
          </p>
          <input
            value={note}
            aria-label="Why"
            placeholder="Why, in a line (optional)"
            onChange={(e) => setNote(e.target.value)}
            className="h-9 w-full rounded-md border border-rule bg-transparent px-3 text-sm text-ink placeholder:text-ink-muted"
          />
          {make.isError && (
            <p role="alert" className="text-sm text-danger">
              {problemText(make.error) ?? "Couldn't link those"}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button look="primary" onClick={() => make.mutate()} disabled={make.isPending}>
              Link
            </Button>
            <Button look="quiet" onClick={() => setChosen(null)}>
              Back
            </Button>
            <Button look="quiet" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

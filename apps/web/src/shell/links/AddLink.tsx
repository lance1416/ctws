import { kindsBetween, type LinkCandidate, type LinkKind, type ObjectType } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { candidatesKey, createLink, linkCandidates, type Endpoint } from './api'
import { useComposing } from '../../platform/keyboard/composition'
import { useRegistry } from '../registry'
import { Modal } from '../../platform/ui/Modal'
import { BUTTON } from '../../platform/ui/buttonStyles'

/**
 * SAYING THAT TWO THINGS ARE CONNECTED.
 *
 * TWO STEPS, because there are two questions and neither can be guessed: WHAT, then HOW. The
 * kinds offered depend on both ends (the model allows an attendee between a meeting and a
 * person, and nothing of the sort between two books), so the second list cannot be drawn until
 * the first is answered.
 */
export function AddLink({
  of,
  only,
  onClose,
}: {
  of: Endpoint
  /** Offer things of this one kind: the `+` on a kind's own block links one of that kind. */
  only?: ObjectType | undefined
  onClose: () => void
}) {
  const qc = useQueryClient()
  const registry = useRegistry()
  const box = useRef<HTMLInputElement>(null)
  const composing = useComposing()
  const [typed, setTyped] = useState('')
  const [chosen, setChosen] = useState<LinkCandidate | null>(null)

  const candidates = useQuery({
    queryKey: candidatesKey(of, typed),
    queryFn: () => linkCandidates(of, typed),
    enabled: chosen === null,
  })
  const make = useMutation({
    mutationFn: (kind: LinkKind) =>
      createLink({ from: of, to: { type: chosen!.type, id: chosen!.id }, kind }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['links'] })
      onClose()
    },
  })

  const offered = (candidates.data ?? []).filter((c) => !only || c.type === only)
  // Read FROM this object, so the words are the ones its own page will show on the new row.
  const kinds = chosen ? kindsBetween(of.type, chosen.type) : []

  return (
    <Modal
      title={chosen ? `How is it related?` : 'Link to…'}
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
              {...composing.bind}
              className="h-9 w-full bg-transparent text-ink placeholder:text-ink-muted"
            />
          </div>
          {candidates.isError && (
            <p role="alert" className="px-4 py-3 text-sm text-danger">
              Couldn't search. Check that the server is running.
            </p>
          )}
          {candidates.isSuccess && offered.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink-muted">Nothing matches</p>
          )}
          <ul className="max-h-80 overflow-y-auto py-1">
            {offered.map((c) => (
              <li key={`${c.type}:${c.id}`}>
                <button
                  type="button"
                  onClick={() => setChosen(c)}
                  data-candidate={c.id}
                  className="flex w-full min-w-0 items-baseline gap-2 px-4 py-1.5 text-left text-sm text-ink hover:bg-hover"
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  {c.detail && (
                    <span className="min-w-0 shrink truncate text-xs text-ink-muted">
                      {c.detail}
                    </span>
                  )}
                  {/* WHICH KIND OF THING it is, because one list holds four of them and two
                      titles can read the same. */}
                  <span className="shrink-0 text-xs text-ink-subtle">
                    {registry.relationFor(c.type)?.kind}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-5 py-4">
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{chosen.title}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {kinds.map((k) => (
              <button
                key={k.kind}
                type="button"
                disabled={make.isPending}
                onClick={() => make.mutate(k.kind)}
                className="h-9 rounded-md border border-rule px-3 text-sm text-ink hover:border-rule-strong hover:bg-hover disabled:opacity-50"
              >
                {/* The phrase read along the edge, which is the one this object's page will
                    show. `belongs` says nothing out loud, so it is named here instead. */}
                {k.label || 'Part of'}
              </button>
            ))}
          </div>
          {make.isError && (
            <p role="alert" className="text-sm text-danger">
              {make.error instanceof Error ? make.error.message : "Couldn't link those"}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setChosen(null)} className={BUTTON.quiet}>
              Back
            </button>
            <button type="button" onClick={onClose} className={BUTTON.quiet}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

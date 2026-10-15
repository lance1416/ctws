import { KeyHint } from '../../platform/ui/KeyHint'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRegistry, type Registry } from '../registry'
import { federate, type ProviderResult } from './federate'
import { recentList } from './recent'
import { useMe } from '../auth/useMe'
import { Modal } from '../../platform/ui/Modal'
import { useComposing } from '../../platform/keyboard/composition'
import { BUTTON } from '../../platform/ui/buttonStyles'

/** Long enough that typing a word does not fire a request per letter, short enough to feel live. */
const DEBOUNCE_MS = 150

type Row = {
  key: string
  to: string
  title: string
  meta?: ReactNode
  mark?: ReactNode
  rail?: ReactNode
  /** The `g` key that goes straight there, for a place. */
  hint?: string
  /** A module hit's id, its test handle. */
  hit?: string
  group: 'recent' | 'place' | 'hit'
}

const GROUP_LABEL: Partial<Record<Row['group'], string>> = { recent: 'Recent', place: 'Go to' }

/** The pinned pages, Things and every kind, each showing its `g` key so the key is learned. */
function places(registry: Registry): Row[] {
  const keys = new Map(registry.chords.map((c) => [c.id, c.key]))
  const all = [
    ...registry.pinned.map((p) => ({ label: p.label, to: p.to, chord: p.chord })),
    { label: 'Things', to: '/things', chord: undefined },
    ...registry.kinds.map((k) => ({ label: k.label, to: k.to, chord: k.chord })),
  ]
  return all.map(({ label, to, chord }) => {
    const key = chord ? keys.get(chord) : undefined
    const place: Row = { key: `place:${label}`, to, title: label, group: 'place' }
    return key ? { ...place, hint: `g ${key}` } : place
  })
}

/**
 * Federated search, opened with `f` or the header's Search button. The combobox is written out
 * rather than taken from a library so Escape reaches the dialog and closes the whole thing.
 */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const composing = useComposing()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const list = useRef<HTMLUListElement>(null)
  const box = useRef<HTMLInputElement>(null)
  const base = useId()
  const listId = `${base}-results`
  const optionId = (i: number) => `${base}-option-${i}`

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // One hook per provider; the registry's list is fixed, so the hook order is too.
  const registry = useRegistry()
  const parts: ProviderResult[] = registry.search.map((p) => ({
    moduleId: p.moduleId,
    moduleLabel: p.moduleLabel,
    ...p.useHits(debounced),
  }))
  const results = federate(parts)
  // Read once when the dialog opens: the list must not reshuffle under the reader.
  const userId = useMe().data?.id
  const [recent] = useState(() => (userId ? recentList(userId) : []))
  const everywhere = useMemo(() => places(registry), [registry])
  // Places follow the typing at once and only module hits wait for the debounce, so an early
  // Enter does not choose from the list as it was before the typing.
  const typing = query.trim()
  const typed = typing.toLocaleLowerCase()
  const rows: Row[] =
    typing.length === 0
      ? [
          ...recent.map((r) => ({
            key: `recent:${r.type}:${r.id}`,
            to: r.to,
            title: r.title,
            meta: r.kind,
            group: 'recent' as const,
          })),
          ...everywhere,
        ]
      : [
          ...everywhere.filter((p) => p.title.toLocaleLowerCase().includes(typed)),
          ...(debounced.length > 0 ? results.rows : []).map((hit) => ({
            key: `${hit.moduleId}:${hit.id}`,
            to: hit.to,
            title: hit.title,
            meta: (
              <>
                {results.showModule && `${hit.moduleLabel} · `}
                {hit.meta}
              </>
            ),
            mark: hit.mark,
            rail: hit.rail,
            hit: hit.id,
            group: 'hit' as const,
          })),
        ]
  // A shorter result set must not leave the selection pointing past the end.
  const at = Math.min(active, Math.max(rows.length - 1, 0))

  useEffect(() => setActive(0), [typing, debounced])
  useEffect(() => {
    document.getElementById(optionId(at))?.scrollIntoView({ block: 'nearest' })
  }, [at])

  const choose = (row: Row) => {
    onClose()
    navigate(row.to)
  }

  return (
    // `initialFocus`, not `autoFocus`: Radix moves focus itself on open, and would land on Close.
    <Modal title="Search" onClose={onClose} initialFocus={box}>
      <div className="border-b border-rule px-4 py-3">
        <input
          ref={box}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={rows.length > 0 ? optionId(at) : undefined}
          {...composing.bind}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
              e.preventDefault()
              setActive(Math.min(at + 1, rows.length - 1))
            } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
              e.preventDefault()
              setActive(Math.max(at - 1, 0))
            } else if (e.key === 'Enter' && !composing.composingNow(e)) {
              e.preventDefault()
              const row = rows[at]
              // A module's hit for words not yet sent would be the previous word's: wait.
              if (row && !(row.group === 'hit' && typing !== debounced)) choose(row)
            }
          }}
          placeholder="Search…"
          aria-label="Search"
          className="h-9 w-full bg-transparent px-0.5 text-ink placeholder:text-ink-muted"
        />
      </div>
      {results.isError && (
        <p role="alert" className="px-4 py-3 text-sm text-danger">
          Search failed. Check that the server is running.
        </p>
      )}
      {debounced.length > 0 && results.isSuccess && rows.length === 0 && (
        <div className="px-4 py-3">
          <p className="text-sm text-ink">Nothing matches</p>
          <button
            type="button"
            onClick={() => {
              setQuery('')
              box.current?.focus()
            }}
            className={`mt-3 -ml-2 ${BUTTON.link}`}
          >
            Try another word
          </button>
        </div>
      )}
      {/* The options are not buttons: focus stays in the box, and `aria-activedescendant` walks
          the list without adding a tab stop per result. */}
      <ul
        ref={list}
        id={listId}
        role="listbox"
        aria-label="Search results"
        className="max-h-[52vh] overflow-y-auto"
      >
        {runs(rows).map((run) => {
          const options = run.rows.map((row, j) => (
            <SearchRow
              key={row.key}
              row={row}
              id={optionId(run.start + j)}
              selected={run.start + j === at}
              onChoose={() => choose(row)}
              onHover={() => setActive(run.start + j)}
            />
          ))
          const label = GROUP_LABEL[run.group]
          if (!label) return options
          const heading = `${base}-${run.group}`
          return (
            <li key={run.group} role="presentation">
              <div id={heading} className="px-5 pt-3 pb-1 text-xs font-semibold text-ink-subtle">
                {label}
              </div>
              <ul role="group" aria-labelledby={heading}>
                {options}
              </ul>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}

/** Consecutive rows of one group, and where the run starts in the flat list. */
function runs(rows: Row[]): { group: Row['group']; start: number; rows: Row[] }[] {
  const out: { group: Row['group']; start: number; rows: Row[] }[] = []
  rows.forEach((row, i) => {
    const last = out[out.length - 1]
    if (last && last.group === row.group) last.rows.push(row)
    else out.push({ group: row.group, start: i, rows: [row] })
  })
  return out
}

function SearchRow({
  row,
  id,
  selected,
  onChoose,
  onHover,
}: {
  row: Row
  id: string
  selected: boolean
  onChoose: () => void
  onHover: () => void
}) {
  return (
    <>
      <li
        id={id}
        role="option"
        data-search-result={row.hit}
        aria-selected={selected}
        onClick={onChoose}
        onMouseEnter={onHover}
        // A row with no rail keeps the rail's 3px, so every marker lands at one x.
        className={`relative flex w-full cursor-pointer items-start gap-2 py-2 pr-4 pl-2 text-left ${
          selected ? 'bg-hover' : ''
        }`}
      >
        {row.rail ?? <span aria-hidden="true" className="w-[3px] shrink-0" />}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">{row.mark}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-ink">{row.title}</span>
          {row.meta && <span className="truncate text-sm text-ink-muted">{row.meta}</span>}
        </span>
        {row.hint && (
          <KeyHint className="mt-0.5 shrink-0 rounded border border-rule px-1.5 text-xs leading-5 text-ink-subtle">
            {row.hint}
          </KeyHint>
        )}
      </li>
    </>
  )
}

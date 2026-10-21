import { KeyHint } from '../../platform/ui/KeyHint'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useDebouncedValue } from '../../platform/time/useDebouncedValue'
import { useNavigate } from 'react-router-dom'
import { useRegistry, type Registry } from '../registry'
import { federate, type ProviderResult } from './federate'
import { recentList } from './recent'
import { useMe } from '../auth/useMe'
import { Modal } from '../../platform/ui/Modal'
import { useComposing } from '../../platform/keyboard/composition'
import { pressesWith, useKeyTable, type KeyTable } from '../../platform/keyboard/keyTable'
import { Button } from '../../platform/ui/Button'

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

/** Any modifier, or none: the box's keys mean the same with any held. */
const ANY = { either: ['Ctrl', 'Meta', 'Alt', 'Shift'] } as const

/** The box's keys: the list is walked from the box, which keeps focus. */
const RESULT_KEYS: KeyTable<'next' | 'previous' | 'choose'> = {
  title: 'In search',
  rows: [
    {
      keys: '↓ / Ctrl+N',
      does: 'Next result',
      presses: {
        ...pressesWith('ArrowDown', 'next', ANY),
        ...pressesWith('n', 'next', { held: ['Ctrl'], either: ['Meta', 'Alt'] }),
      },
    },
    {
      keys: '↑ / Ctrl+P',
      does: 'Previous result',
      presses: {
        ...pressesWith('ArrowUp', 'previous', ANY),
        ...pressesWith('p', 'previous', { held: ['Ctrl'], either: ['Meta', 'Alt'] }),
      },
    },
    { keys: 'Enter', does: 'Go to the result', presses: pressesWith('Enter', 'choose', ANY) },
  ],
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
  const keys = useKeyTable(RESULT_KEYS)
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query.trim())
  // The highlighted row, for the words it was chosen under: new words start again at the top.
  const [picked, setPicked] = useState({ at: 0, under: '' })
  const navigate = useNavigate()
  const box = useRef<HTMLInputElement>(null)
  const base = useId()
  const listId = `${base}-results`
  const optionId = (i: number) => `${base}-option-${i}`

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
                {hit.moduleLabel} · {hit.meta}
              </>
            ),
            mark: hit.mark,
            rail: hit.rail,
            hit: hit.id,
            group: 'hit' as const,
          })),
        ]
  // The debounced hits landing later keep it, or a row the keyboard already moved to would be lost
  // under the Enter about to choose it. A shorter result set must not leave it past the end.
  const active = picked.under === typing ? picked.at : 0
  const at = Math.min(active, Math.max(rows.length - 1, 0))
  const setActive = (next: number) => setPicked({ at: next, under: typing })
  useEffect(() => {
    document.getElementById(optionId(at))?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId is fixed by useId; only a move of the selection scrolls.
  }, [at])

  const choose = (row: Row) => {
    onClose()
    navigate(row.to)
  }

  return (
    // `initialFocus`, not `autoFocus`: Radix moves focus itself on open, and would land on Close.
    <Modal title="Search" onClose={onClose} initialFocus={box}>
      <div className="border-b border-line px-4 py-3">
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
          onKeyDown={(e) =>
            keys(e, {
              next: () => setActive(Math.min(at + 1, rows.length - 1)),
              previous: () => setActive(Math.max(at - 1, 0)),
              choose: () => {
                if (composing.composingNow(e)) return false
                const row = rows[at]
                // A module's hit for words not yet sent would be the previous word's: wait.
                if (row && !(row.group === 'hit' && typing !== debounced)) choose(row)
              },
            })
          }
          placeholder="Search…"
          aria-label="Search"
          className="h-9 w-full bg-transparent px-0.5 text-ink placeholder:text-muted"
        />
      </div>
      {results.isError && (
        <p role="alert" className="px-4 py-3 text-ui text-stop-t">
          Search failed. Check that the server is running.
        </p>
      )}
      {debounced.length > 0 && results.isSuccess && rows.length === 0 && (
        <div className="px-4 py-3">
          <p className="text-ui text-ink">Nothing matches</p>
          <Button
            look="link"
            onClick={() => {
              setQuery('')
              box.current?.focus()
            }}
            className="mt-3 -ml-2"
          >
            Try another word
          </Button>
        </div>
      )}
      {/* The options are not buttons: focus stays in the box, and `aria-activedescendant` walks
          the list without adding a tab stop per result. */}
      <ul
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
              <div id={heading} className="px-5 pt-3 pb-1 text-meta font-medium text-subtle">
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
        {row.meta && <span className="truncate text-ui text-muted">{row.meta}</span>}
      </span>
      {row.hint && (
        <KeyHint className="mt-0.5 shrink-0 rounded-key border border-line px-1.5 text-meta leading-5 text-subtle">
          {row.hint}
        </KeyHint>
      )}
    </li>
  )
}

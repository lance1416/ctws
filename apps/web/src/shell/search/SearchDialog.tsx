import type { ObjectType } from '@ctws/contracts'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDebouncedValue } from '../../platform/time/useDebouncedValue'
import { useComposing } from '../../platform/keyboard/composition'
import { keyLabel } from '../../platform/keyboard/keys'
import { pressesWith, useKeyTable, type KeyTable } from '../../platform/keyboard/keyTable'
import { BUTTON, KEY } from '../../platform/ui/buttonStyles'
import { KIND_ICON, PLACE_ICON } from '../../platform/ui/icons'
import { Modal } from '../../platform/ui/Modal'
import { useMe } from '../auth/useMe'
import { useInspector } from '../layout/inspectorAddress'
import { KIND_TEXT, KIND_TINT, PLACES } from '../layout/places'
import { useRegistry } from '../registry'
import { federate, type ProviderResult } from './federate'
import { recentList } from './recent'
import { grouped, KIND_WORDS, kindsWithHits, nextTab, scopesMatching, type Tab } from './view'

/** A line the keyboard can land on: something to open, a place to go, or a kind to scope to. */
type Row =
  | {
      kind: 'hit'
      key: string
      type: ObjectType
      id: string
      to: string
      title: string
      meta: ReactNode
      mark: ReactNode
    }
  | { kind: 'recent'; key: string; type: ObjectType; id: string; to: string; title: string }
  | { kind: 'place'; key: string; to: string; title: string; hint: string; icon: ReactNode }
  | { kind: 'scope'; key: string; type: ObjectType }

/** Any modifier, or none: the box's keys mean the same with any held. */
const ANY = { either: ['Ctrl', 'Meta', 'Alt', 'Shift'] } as const

/** The box's keys (FR-024): the list is walked from the box, which keeps focus. */
const RESULT_KEYS: KeyTable<'next' | 'previous' | 'open' | 'beside' | 'tab' | 'back'> = {
  title: 'In search',
  rows: [
    {
      keys: '↓ / Ctrl N',
      does: 'Next result',
      presses: {
        ...pressesWith('ArrowDown', 'next', ANY),
        ...pressesWith('n', 'next', { held: ['Ctrl'], either: ['Meta', 'Alt'] }),
      },
    },
    {
      keys: '↑ / Ctrl P',
      does: 'Previous result',
      presses: {
        ...pressesWith('ArrowUp', 'previous', ANY),
        ...pressesWith('p', 'previous', { held: ['Ctrl'], either: ['Meta', 'Alt'] }),
      },
    },
    { keys: 'Enter', does: 'Open', presses: { Enter: 'open', 'Shift+Enter': 'open' } },
    {
      keys: 'Ctrl Enter',
      does: 'Open beside, and stay on this page',
      presses: { 'Ctrl+Enter': 'beside', 'Meta+Enter': 'beside' },
    },
    { keys: 'Tab', does: 'Next kind', presses: { Tab: 'tab', 'Shift+Tab': 'back' } },
    { keys: '/', does: 'Scope to one kind', presses: {} },
  ],
}

/**
 * SEARCH EVERYTHING (FR-024, artboard 9): one box, Ctrl K. Results sit under tabs by kind; All
 * shows five of each. `/` scopes the box to one kind. Before anything is typed: what was opened
 * lately, and every place with its key. Enter opens; Ctrl Enter opens in the inspector and keeps
 * the page. The combobox is written out rather than taken from a library so Escape reaches the
 * dialog and closes the whole thing.
 */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const composing = useComposing()
  const keys = useKeyTable(RESULT_KEYS)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<ObjectType | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const debounced = useDebouncedValue(query.trim())
  // The highlighted row, for the words it was chosen under: new words start again at the top.
  const [picked, setPicked] = useState({ at: 0, under: '' })
  const navigate = useNavigate()
  const inspector = useInspector()
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
  // The one New that works from here before the kinds' own forms land: a task, into the inbox.
  const capture = registry.captures.find((c) => c.moduleId === registry.captureModuleId)!
  const inbox = capture.capture.useTarget()
  // Read once when the dialog opens: the list must not reshuffle under the reader.
  const userId = useMe().data?.id
  const [recent] = useState(() => (userId ? recentList(userId) : []))

  const typing = query.trim()
  const typed = typing.toLocaleLowerCase()
  const scoping = scope === null && query.startsWith('/')
  const hits = (debounced.length > 0 ? results.rows : []).filter(
    (h) => (scope ?? 'all') === 'all' || h.type === scope,
  )
  const view: Tab = scope ?? tab
  const tabs: Tab[] = ['all', ...kindsWithHits(hits).map((k) => k.type)]
  const groups = grouped(hits, view)

  const rows: Row[] = scoping
    ? scopesMatching(query.slice(1)).map((type) => ({ kind: 'scope', key: `scope:${type}`, type }))
    : typing.length === 0 && scope === null
      ? [
          ...recent.map((r) => ({
            kind: 'recent' as const,
            key: `recent:${r.type}:${r.id}`,
            type: r.type as ObjectType,
            id: r.id,
            to: r.to,
            title: r.title,
          })),
          ...PLACES.map((p) => ({
            kind: 'place' as const,
            key: `place:${p.id}`,
            to: p.to,
            title: p.label,
            hint: `G ${p.key.toUpperCase()}`,
            icon: (
              <p.icon size={16} aria-hidden="true" className={p.kind ? KIND_TEXT[p.kind] : ''} />
            ),
          })),
        ]
      : [
          // Places follow the typing at once; only module hits wait for the debounce.
          ...(scope === null && view === 'all'
            ? PLACES.filter((p) => p.label.toLocaleLowerCase().includes(typed)).map((p) => ({
                kind: 'place' as const,
                key: `place:${p.id}`,
                to: p.to,
                title: p.label,
                hint: `G ${p.key.toUpperCase()}`,
                icon: (
                  <p.icon
                    size={16}
                    aria-hidden="true"
                    className={p.kind ? KIND_TEXT[p.kind] : ''}
                  />
                ),
              }))
            : []),
          ...groups.flatMap((g) =>
            g.rows.map((hit) => ({
              kind: 'hit' as const,
              key: `${hit.type}:${hit.id}`,
              type: hit.type,
              id: hit.id,
              to: hit.to,
              title: hit.title,
              meta: hit.meta,
              mark: hit.mark,
            })),
          ),
        ]
  // The debounced hits landing later keep it, or a row the keyboard already moved to would be lost
  // under the Enter about to choose it. A shorter result set must not leave it past the end.
  const active = picked.under === `${view}:${query}` ? picked.at : 0
  const at = Math.min(active, Math.max(rows.length - 1, 0))
  const setActive = (next: number) => setPicked({ at: next, under: `${view}:${query}` })
  useEffect(() => {
    document.getElementById(optionId(at))?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId is fixed by useId; only a move of the selection scrolls.
  }, [at])

  const settled = typing === debounced
  const nothing = debounced.length > 0 && !scoping && results.isSuccess && hits.length === 0
  const scopeTo = (type: ObjectType) => {
    setScope(type)
    setTab('all')
    setQuery('')
  }
  const open = (row: Row, beside: boolean) => {
    if (row.kind === 'scope') return scopeTo(row.type)
    if (row.kind === 'hit' && !settled) return
    onClose()
    if (beside && row.kind !== 'place') inspector.show({ type: row.type, id: row.id })
    else navigate(row.to)
  }
  const newTask = async () => {
    if (!inbox.target) return
    await inbox.target.submit(typing, { projectId: null, date: null })
    onClose()
    navigate(inbox.target.to)
  }

  return (
    // `initialFocus`, not `autoFocus`: Radix moves focus itself on open, and would land on Close.
    <Modal title="Search everything" onClose={onClose} initialFocus={box} palette>
      <div className="flex h-13 items-center gap-2.5 border-b border-line px-4">
        <PLACE_ICON.search size={20} aria-hidden="true" className="shrink-0 text-muted" />
        {scope && (
          <span
            className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-control px-2 text-meta font-medium ${KIND_TINT[scope]} ${KIND_TEXT[scope]}`}
          >
            <ScopeIcon type={scope} />
            {KIND_WORDS[scope].many}
          </span>
        )}
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
            // Backspace on an empty box takes the scope off.
            if (e.key === 'Backspace' && query === '' && scope !== null) {
              e.preventDefault()
              setScope(null)
              return
            }
            keys(e, {
              next: () => setActive(Math.min(at + 1, rows.length - 1)),
              previous: () => setActive(Math.max(at - 1, 0)),
              open: () => {
                if (composing.composingNow(e)) return false
                const row = rows[at]
                if (row) open(row, false)
                else if (nothing && typing && inbox.target) void newTask()
              },
              beside: () => {
                const row = rows[at]
                if (row) open(row, true)
              },
              tab: () => {
                if (scope !== null || tabs.length < 2) return nothing ? setScope(null) : false
                setTab(nextTab(tabs, tab))
              },
              back: () => {
                if (scope !== null || tabs.length < 2) return false
                setTab(nextTab(tabs, tab, true))
              },
            })
          }}
          placeholder={
            scope ? `Search ${KIND_WORDS[scope].many.toLocaleLowerCase()}` : 'Search everything'
          }
          aria-label="Search"
          className="h-9 min-w-0 flex-1 bg-transparent text-prose text-ink placeholder:text-subtle focus-visible:outline-none"
        />
        <kbd className={KEY}>Esc</kbd>
      </div>

      {hits.length > 0 && scope === null && !scoping && (
        <div
          role="tablist"
          className="flex gap-0.5 overflow-hidden border-b border-line px-2.5 py-1.5"
        >
          {tabs.map((t) => {
            const n =
              t === 'all' ? hits.length : (kindsWithHits(hits).find((k) => k.type === t)?.n ?? 0)
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={view === t}
                tabIndex={-1}
                onClick={() => setTab(t)}
                className={`inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 text-meta font-medium whitespace-nowrap ${
                  view === t ? 'bg-select text-ink' : 'text-muted hover:bg-hover'
                }`}
              >
                {t !== 'all' && <ScopeIcon type={t} size={14} />}
                {t === 'all' ? 'All' : KIND_WORDS[t].many}
                <span className="font-normal text-subtle tabular-nums">{n}</span>
              </button>
            )
          })}
          {8 - (tabs.length - 1) > 0 && (
            <span className="inline-flex h-7 items-center px-2.5 text-meta text-subtle whitespace-nowrap">
              {8 - (tabs.length - 1)} more kinds with nothing
            </span>
          )}
        </div>
      )}

      {results.isError && (
        <p role="alert" className="px-4 py-3 text-ui text-stop-t">
          Search failed. Check that the server is running.
        </p>
      )}
      {nothing && (
        <div className="flex flex-col items-start gap-3 px-4 py-4">
          <p className="text-ui text-ink">
            No {view === 'all' ? 'results' : KIND_WORDS[view].many.toLocaleLowerCase()} match “
            {debounced}”.
          </p>
          <div className="flex flex-wrap gap-2">
            {scope !== null && (
              <button type="button" onClick={() => setScope(null)} className={BUTTON.secondary}>
                Search every kind
                <kbd className={KEY}>Tab</kbd>
              </button>
            )}
            {inbox.target && (
              <button type="button" onClick={() => void newTask()} className={BUTTON.secondary}>
                New task “{debounced}”<kbd className={KEY}>Enter</kbd>
              </button>
            )}
          </div>
        </div>
      )}

      {/* The options are not buttons: focus stays in the box, and `aria-activedescendant` walks
          the list without adding a tab stop per result. */}
      <ul
        id={listId}
        role="listbox"
        aria-label="Search results"
        className="max-h-[52vh] overflow-y-auto pb-1.5"
      >
        {runs(rows).map((run) => {
          const options = run.rows.map((row, j) => (
            <SearchRow
              key={row.key}
              row={row}
              id={optionId(run.start + j)}
              selected={run.start + j === at}
              onChoose={() => open(row, false)}
              onHover={() => setActive(run.start + j)}
            />
          ))
          const label = runLabel(run, view)
          if (!label) return options
          const heading = `${base}-${run.key}`
          return (
            <li key={run.key} role="presentation">
              <div
                id={heading}
                className="px-4 pt-2 pb-1 text-meta font-medium tracking-[0.06em] text-subtle uppercase"
              >
                {label}
              </div>
              <ul role="group" aria-labelledby={heading}>
                {options}
              </ul>
            </li>
          )
        })}
      </ul>

      <div className="flex h-10 items-center gap-4 border-t border-line px-4 text-meta text-subtle">
        <Legend keys="Enter">Open</Legend>
        <Legend keys={keyLabel('Ctrl Enter')}>Open beside</Legend>
        <Legend keys="Tab">Next kind</Legend>
        <Legend keys="/">Scope to a kind</Legend>
      </div>
    </Modal>
  )
}

function Legend({ keys, children }: { keys: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className={KEY}>{keys}</kbd>
      {children}
    </span>
  )
}

/** The kind's icon in the kind's colour, at a chip's or a row's size. */
function ScopeIcon({ type, size = 12 }: { type: ObjectType; size?: 12 | 14 }) {
  const Icon = KIND_ICON[type]
  return <Icon size={size} aria-hidden="true" className={KIND_TEXT[type]} />
}

type Run = {
  key: string
  group: Row['kind']
  type?: ObjectType | undefined
  start: number
  rows: Row[]
}

/** Consecutive rows of one group (hits by kind), and where the run starts in the flat list. */
function runs(rows: Row[]): Run[] {
  const out: Run[] = []
  rows.forEach((row, i) => {
    const type = row.kind === 'hit' ? row.type : undefined
    const key = row.kind === 'hit' ? `hit:${row.type}` : row.kind
    const last = out[out.length - 1]
    if (last && last.key === key) last.rows.push(row)
    else out.push({ key, group: row.kind, type, start: i, rows: [row] })
  })
  return out
}

function runLabel(run: Run, view: Tab): string | null {
  if (run.group === 'recent') return 'Recent'
  if (run.group === 'place') return 'Go to'
  if (run.group === 'scope') return 'Only'
  if (run.type && view === 'all') return KIND_WORDS[run.type].many
  return null
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
  const shared = `grid min-h-10 cursor-pointer items-center gap-x-3 px-4 text-ui text-ink ${
    selected ? 'bg-select' : ''
  }`
  if (row.kind === 'scope')
    return (
      <li
        id={id}
        role="option"
        aria-selected={selected}
        onClick={onChoose}
        onMouseEnter={onHover}
        className={`${shared} grid-cols-[24px_minmax(0,1fr)]`}
      >
        <span
          className={`inline-grid size-6 place-items-center rounded-control ${KIND_TINT[row.type]}`}
        >
          <ScopeIcon type={row.type} size={14} />
        </span>
        <span>{KIND_WORDS[row.type].many}</span>
      </li>
    )
  if (row.kind === 'place')
    return (
      <li
        id={id}
        role="option"
        aria-selected={selected}
        onClick={onChoose}
        onMouseEnter={onHover}
        className={`${shared} grid-cols-[24px_minmax(0,1fr)_auto]`}
      >
        <span className="inline-grid size-6 place-items-center text-muted">{row.icon}</span>
        <span className="truncate">{row.title}</span>
        <kbd className={KEY}>{row.hint}</kbd>
      </li>
    )
  if (row.kind === 'recent')
    return (
      <li
        id={id}
        role="option"
        aria-selected={selected}
        onClick={onChoose}
        onMouseEnter={onHover}
        className={`${shared} grid-cols-[24px_minmax(0,1fr)_92px]`}
      >
        <span className="inline-grid size-6 place-items-center">
          <ScopeIcon type={row.type} size={14} />
        </span>
        <span className="truncate">{row.title}</span>
        <span className="text-meta text-subtle">{KIND_WORDS[row.type].one}</span>
      </li>
    )
  return (
    <li
      id={id}
      role="option"
      data-search-result={row.id}
      aria-selected={selected}
      onClick={onChoose}
      onMouseEnter={onHover}
      className={`${shared} grid-cols-[24px_minmax(0,1fr)_180px_92px]`}
    >
      <span className="inline-grid size-6 place-items-center">
        {row.mark ?? <ScopeIcon type={row.type} size={14} />}
      </span>
      <span className="truncate">{row.title}</span>
      <span className="truncate text-muted">{row.meta}</span>
      <span className="text-meta text-subtle">{KIND_WORDS[row.type].one}</span>
    </li>
  )
}

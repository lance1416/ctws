import type { LinkCandidate, ObjectType } from '@ctws/contracts'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDebouncedValue } from '../../platform/time/useDebouncedValue'
import { useComposing } from '../../platform/keyboard/composition'
import { keyLabel } from '../../platform/keyboard/keys'
import { pressesWith, useKeyTable, type KeyTable } from '../../platform/keyboard/keyTable'
import { KEY } from '../../platform/ui/buttonStyles'
import { KIND_ICON, LinkIcon, NewIcon, PLACE_ICON } from '../../platform/ui/icons'
import { SkeletonRows } from '../../platform/ui/Block'
import { Modal } from '../../platform/ui/Modal'
import { useMe } from '../auth/useMe'
import { NewContext } from '../creates'
import { useInspector } from '../layout/inspectorAddress'
import { PLACES } from '../layout/places'
import { KIND_TEXT, KIND_TINT } from '../../platform/ui/kinds'
import type { SearchHit } from '../contract'
import { useRegistry } from '../registry'
import { federate, type ProviderResult } from './federate'
import { candidatesQuery, type Endpoint } from '../links/api'
import { recentList } from './recent'
import {
  grouped,
  KIND_ORDER,
  KIND_WORDS,
  kindsWithHits,
  nextTab,
  scopesMatching,
  type Tab,
} from './view'

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
      /** The fourth column: the kind's word, or a message's direction. */
      word: string
    }
  | { kind: 'recent'; key: string; type: ObjectType; id: string; to: string; title: string }
  | { kind: 'place'; key: string; to: string; title: string; hint: string; icon: ReactNode }
  | { kind: 'scope'; key: string; type: ObjectType }

/** Any modifier, or none: the box's keys mean the same with any held. */
const ANY = { either: ['Ctrl', 'Meta', 'Alt', 'Shift'] } as const

/** The box's keys (FR-024): the list is walked from the box, which keeps focus. */
export const SEARCH_KEYS: KeyTable<'next' | 'previous' | 'open' | 'beside' | 'tab' | 'back'> = {
  title: 'In search',
  rows: [
    {
      keys: '↓ or Ctrl+N',
      does: 'Next result',
      presses: {
        ...pressesWith('ArrowDown', 'next', ANY),
        ...pressesWith('n', 'next', { held: ['Ctrl'], either: ['Meta', 'Alt'] }),
      },
    },
    {
      keys: '↑ or Ctrl+P',
      does: 'Previous result',
      presses: {
        ...pressesWith('ArrowUp', 'previous', ANY),
        ...pressesWith('p', 'previous', { held: ['Ctrl'], either: ['Meta', 'Alt'] }),
      },
    },
    { keys: 'Tab', does: 'Next kind', presses: { Tab: 'tab', 'Shift+Tab': 'back' } },
    { keys: '/', does: 'Scope to a kind', presses: {} },
    {
      keys: 'Ctrl+Enter',
      does: 'Open beside, in the inspector',
      presses: { 'Ctrl+Enter': 'beside', 'Meta+Enter': 'beside' },
    },
    { keys: 'Enter', does: 'Go to the result', presses: { Enter: 'open', 'Shift+Enter': 'open' } },
  ],
}

/** The places before anything is typed: the pages across kinds, then the kinds in search's order. */
const PLACES_IN_ORDER = [
  ...PLACES.filter((p) => p.kind === null),
  ...KIND_ORDER.flatMap((k) => PLACES.filter((p) => p.kind === k)),
]

const placeRow = (p: (typeof PLACES)[number]): Row => ({
  kind: 'place',
  key: `place:${p.id}`,
  to: p.to,
  title: p.label,
  hint: `G ${p.key.toUpperCase()}`,
  icon: <p.icon size={16} aria-hidden="true" className={p.kind ? KIND_TEXT[p.kind] : ''} />,
})

/**
 * SEARCH EVERYTHING (FR-024, artboard 9): one box, Ctrl K. Results sit under tabs by kind; All
 * shows five of each. `/` scopes the box to one kind. Before anything is typed: what was opened
 * lately, and every place with its key. Enter opens; Ctrl Enter opens in the inspector and keeps
 * the page. The combobox is written out rather than taken from a library so Escape reaches the
 * dialog and closes the whole thing.
 *
 * As LINK's picker (FR-027) it is the same box at 380 wide: the rows are drawn the same, and the
 * line of why is asked at its foot once a row is chosen.
 */
export type Pick = {
  /** The thing being linked from: the answer leaves it out. */
  of: Endpoint
  title: string
  /** Offer this kind only, when the block it opened from holds one kind. */
  only?: ObjectType | undefined
  /** The chosen thing, with its line of why if one was written. */
  onPick: (thing: LinkCandidate, why: string | null) => void
  busy?: boolean
  /** Why the last pick did not take, said at the foot. */
  error?: string | null
}

export function SearchDialog({ onClose, pick }: { onClose: () => void; pick?: Pick }) {
  const composing = useComposing()
  const keys = useKeyTable(SEARCH_KEYS)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<ObjectType | null>(pick?.only ?? null)
  const [tab, setTab] = useState<Tab>('all')
  const debounced = useDebouncedValue(query.trim())
  // The highlighted row, for the words it was chosen under: new words start again at the top.
  const [picked, setPicked] = useState({ at: 0, under: '' })
  // As a picker: the row chosen, while its line of why is written.
  const [chosen, setChosen] = useState<LinkCandidate | null>(null)
  const [why, setWhy] = useState('')
  const navigate = useNavigate()
  const inspector = useInspector()
  const openNew = useContext(NewContext)
  const box = useRef<HTMLInputElement>(null)
  const whyBox = useRef<HTMLInputElement>(null)
  const base = useId()
  const listId = `${base}-results`
  const optionId = (i: number) => `${base}-option-${i}`

  // One hook per provider; the registry's list is fixed, so the hook order is too.
  const registry = useRegistry()
  // A thing as a row: the kind's own mark and fact, the components its module's rows use too.
  const thingHit = (c: LinkCandidate): SearchHit => {
    const relation = registry.relationFor(c.type)
    return {
      id: c.id,
      type: c.type,
      title: c.title,
      to: relation.to(c.id),
      meta: relation.Fact ? <relation.Fact thing={c} /> : null,
      mark: relation.Mark ? <relation.Mark thing={c} /> : null,
    }
  }
  const parts: ProviderResult[] = registry.search.map((p) => ({
    moduleId: p.moduleId,
    moduleLabel: p.moduleLabel,
    ...p.useHits(debounced),
  }))
  // The kinds no module searches more closely come from the shell's search across every module
  // (BUG-015): organisations, meetings, communication, notes, projects.
  const searched = new Set(
    registry.relations
      .filter((r) => registry.search.some((p) => p.moduleId === r.moduleId))
      .map((r) => r.type),
  )
  const others = KIND_ORDER.filter((k) => !searched.has(k))
  const rest = useQuery({
    ...candidatesQuery(null, debounced, others),
    enabled: !pick && debounced.length > 0 && others.length > 0,
    placeholderData: keepPreviousData,
  })
  const restRows = (rest.data ?? []).map((c) => thingHit(c))
  const found = federate([
    ...parts,
    {
      moduleId: 'shell',
      moduleLabel: '',
      hits: restRows,
      isError: rest.isError,
      isSuccess: others.length === 0 || (rest.isSuccess && !rest.isPlaceholderData),
    },
  ])
  // As a picker (FR-027) the server's candidates are the hits: every kind, the likely few first.
  const candidates = useQuery({
    ...candidatesQuery(pick?.of ?? { type: 'project', id: '' }, debounced),
    enabled: pick !== undefined,
    placeholderData: keepPreviousData,
  })
  const results = pick
    ? {
        rows: (candidates.data ?? []).map((c) => ({
          ...thingHit(c),
          moduleId: '',
          moduleLabel: '',
        })),
        isError: candidates.isError,
        isSuccess: candidates.isSuccess && !candidates.isPlaceholderData,
      }
    : found
  const hitsById = new Map(
    (pick ? (candidates.data ?? []) : (rest.data ?? [])).map((c) => [c.id, c]),
  )
  // A task made from here goes to the inbox, as a captured line does.
  const capture = registry.captures.find((c) => c.moduleId === registry.captureModuleId)!
  const inbox = capture.capture.useTarget()
  // Read once when the dialog opens: the list must not reshuffle under the reader.
  const userId = useMe().data?.id
  const [recent] = useState(() => (userId ? recentList(userId) : []))

  const typing = query.trim()
  const typed = typing.toLocaleLowerCase()
  const scoping = scope === null && query.startsWith('/')
  const hits = (debounced.length > 0 || pick ? results.rows : []).filter(
    (h) => (scope ?? 'all') === 'all' || h.type === scope,
  )
  const view: Tab = pick ? 'all' : (scope ?? tab)
  const tabs: Tab[] = ['all', ...kindsWithHits(hits).map((k) => k.type)]
  const groups = grouped(hits, view)

  const rows: Row[] = scoping
    ? scopesMatching(query.slice(1)).map((type) => ({ kind: 'scope', key: `scope:${type}`, type }))
    : typing.length === 0 && scope === null && !pick
      ? [
          ...recent.map((r) => ({
            kind: 'recent' as const,
            key: `recent:${r.type}:${r.id}`,
            type: r.type as ObjectType,
            id: r.id,
            to: r.to,
            title: r.title,
          })),
          ...PLACES_IN_ORDER.map(placeRow),
        ]
      : [
          // Places follow the typing at once; only module hits wait for the debounce.
          ...(scope === null && view === 'all' && !pick
            ? PLACES_IN_ORDER.filter((p) => p.label.toLocaleLowerCase().includes(typed)).map(
                placeRow,
              )
            : []),
          ...groups.flatMap((g) =>
            g.rows.map((hit) => {
              const thing = hitsById.get(hit.id)
              return {
                kind: 'hit' as const,
                key: `${hit.type}:${hit.id}`,
                type: hit.type,
                id: hit.id,
                to: hit.to,
                title: hit.title,
                meta: hit.meta,
                mark: hit.mark,
                word:
                  thing?.type === 'communication'
                    ? thing.direction === 'sent'
                      ? 'Sent'
                      : 'Received'
                    : KIND_WORDS[hit.type].one,
              }
            }),
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
  useEffect(() => {
    if (chosen) whyBox.current?.focus()
  }, [chosen])

  const settled = typing === debounced
  const nothing = debounced.length > 0 && !scoping && results.isSuccess && hits.length === 0
  // What a New from an empty result makes: the scoped kind, else a task (FR-024 "Empty").
  const newKind: ObjectType = scope ?? 'task'
  const creator = registry.creates.find((c) => c.kind === newKind)
  const canNew = !pick && (newKind === 'task' ? inbox.target !== null : creator !== undefined)
  const newLabel = `New ${KIND_WORDS[newKind].one.toLocaleLowerCase()}`
  const makeNew = async () => {
    if (newKind === 'task') {
      if (!inbox.target) return
      const made = await inbox.target.submit(typing, { projectId: null, date: null })
      onClose()
      // Made from a search, which is no page's: it opens (FR-026), a task in the inspector.
      navigate(made)
    } else if (creator) {
      onClose()
      // Made from a search, which is no page's: it opens, as the task made here does.
      openNew(creator, { opens: true })
    }
  }
  const scopeTo = (type: ObjectType) => {
    setScope(type)
    setTab('all')
    setQuery('')
  }
  // `typed`: from the keyboard, a hit for words not yet sent would be the previous words' (wait);
  // a pointer chooses what it can see.
  const open = (row: Row, beside: boolean, typed = false) => {
    if (row.kind === 'scope') return scopeTo(row.type)
    if (row.kind === 'hit' && typed && !settled) return
    if (pick) {
      if (row.kind === 'hit') {
        setWhy('')
        setChosen(hitsById.get(row.id)!)
      }
      return
    }
    onClose()
    if (beside && row.kind !== 'place') inspector.show({ type: row.type, id: row.id })
    else navigate(row.to)
  }

  // The foot says only the keys that do something now (DES-001 section 4).
  const current = rows[at]
  const legends: [string, string][] = []
  if (current) {
    legends.push([
      'Enter',
      current.kind === 'scope'
        ? 'Scope to it'
        : pick
          ? 'Choose'
          : current.kind === 'place'
            ? 'Go'
            : 'Open',
    ])
    if (!pick && (current.kind === 'hit' || current.kind === 'recent'))
      legends.push([keyLabel('Ctrl Enter'), 'Open beside'])
  } else if (nothing && canNew) legends.push(['Enter', newLabel])
  if (!pick && scope === null && tabs.length > 2) legends.push(['Tab', 'Next kind'])
  if (scope !== null && nothing && !pick?.only) legends.push(['Tab', 'Search every kind'])
  if (scope === null && !scoping) legends.push(['/', 'Scope to a kind'])

  return (
    // `initialFocus`, not `autoFocus`: Radix moves focus itself on open, and would land on Close.
    <Modal
      title={pick?.title ?? 'Search everything'}
      onClose={onClose}
      initialFocus={box}
      palette={!pick}
      picker={pick !== undefined}
    >
      <div
        className={`flex items-center gap-2.5 border-b border-line px-4 ${pick ? 'h-11' : 'h-13'}`}
      >
        {pick ? (
          <LinkIcon size={16} aria-hidden="true" className="shrink-0 text-muted" />
        ) : (
          <PLACE_ICON.search size={20} aria-hidden="true" className="shrink-0 text-muted" />
        )}
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
          onChange={(e) => {
            setQuery(e.target.value)
            setChosen(null)
          }}
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={rows.length > 0 ? optionId(at) : undefined}
          {...composing.bind}
          onKeyDown={(e) => {
            // Backspace on an empty box takes the scope off.
            if (e.key === 'Backspace' && query === '' && scope !== null && !pick?.only) {
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
                if (row) open(row, false, true)
                else if (nothing && typing && canNew) void makeNew()
              },
              beside: () => {
                const row = rows[at]
                if (row && !pick) open(row, true, true)
              },
              tab: () => {
                if (scope !== null || tabs.length < 2 || pick)
                  return nothing && !pick?.only ? setScope(null) : false
                setTab(nextTab(tabs, tab))
              },
              back: () => {
                if (scope !== null || tabs.length < 2 || pick) return false
                setTab(nextTab(tabs, tab, true))
              },
            })
          }}
          placeholder={
            scope
              ? `Search ${KIND_WORDS[scope].many.toLocaleLowerCase()}`
              : pick
                ? pick.title
                : 'Search everything'
          }
          aria-label="Search"
          data-bare
          className={`h-9 min-w-0 flex-1 bg-transparent text-ink placeholder:text-subtle ${pick ? 'text-ui' : 'text-prose'}`}
        />
        {!pick && <kbd className={KEY}>Esc</kbd>}
      </div>

      {hits.length > 0 && scope === null && !scoping && !pick && (
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

      {/* Grey rows while the first answer for these words is out (FR-031). */}
      {debounced.length > 0 &&
        !scoping &&
        !results.isSuccess &&
        !results.isError &&
        hits.length === 0 && (
          <div className="px-1 py-1.5" aria-hidden="true">
            <SkeletonRows rows={3} />
          </div>
        )}
      {results.isError && (
        <p role="alert" className="px-4 py-3 text-ui text-stop-t">
          Search failed. Check that the server is running.
        </p>
      )}
      {nothing && (
        <div className="flex flex-col pb-1.5">
          <p className="px-4 pt-3 pb-2 text-ui text-ink">
            No {view === 'all' ? 'results' : KIND_WORDS[view].many.toLocaleLowerCase()} match “
            {debounced}”.
          </p>
          {/* The two next steps (FR-024 "Empty", artboard 23): a line each, the key at the end. */}
          {scope !== null && !pick?.only && (
            <NextStep
              icon={<PLACE_ICON.search size={16} />}
              keys="Tab"
              onClick={() => setScope(null)}
            >
              Search every kind
            </NextStep>
          )}
          {canNew && (
            <NextStep icon={<NewIcon size={16} />} keys="Enter" onClick={() => void makeNew()}>
              {newLabel} “{debounced}”
            </NextStep>
          )}
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
              selected={chosen ? row.kind === 'hit' && row.id === chosen.id : run.start + j === at}
              compact={pick !== undefined}
              onChoose={() => open(row, false)}
              onHover={() => {
                if (!chosen) setActive(run.start + j)
              }}
            />
          ))
          const label = runLabel(run, view, scope)
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

      {pick && chosen ? (
        <div className="flex flex-col border-t border-line">
          <label className="flex h-11 items-center gap-2 px-3.5">
            <input
              ref={whyBox}
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !composing.composingNow(e) && !pick.busy) {
                  e.preventDefault()
                  pick.onPick(chosen, why.trim() || null)
                }
              }}
              {...composing.bind}
              aria-label="Why"
              placeholder="Why, in a line (optional)"
              data-bare
              className="min-w-0 flex-1 bg-transparent text-ui text-ink placeholder:text-subtle"
            />
            <kbd className={KEY}>Enter</kbd>
          </label>
          {pick.error && (
            <p role="alert" className="px-3.5 pb-2.5 text-ui text-stop-t">
              {pick.error}
            </p>
          )}
        </div>
      ) : (
        legends.length > 0 && (
          <div className="flex h-10 items-center gap-4 border-t border-line px-4 text-meta text-subtle">
            {legends.map(([k, does]) => (
              <Legend key={`${k}:${does}`} keys={k}>
                {does}
              </Legend>
            ))}
          </div>
        )
      )}
    </Modal>
  )
}

function Legend({ keys, children }: { keys: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <kbd className={KEY}>{keys}</kbd>
      {children}
    </span>
  )
}

/** One of the empty result's next steps: an icon, what it does, and its key at the end. */
function NextStep({
  icon,
  keys,
  onClick,
  children,
}: {
  icon: ReactNode
  keys: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-1.5 grid h-9 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-control px-2.5 text-left text-ui text-ink hover:bg-hover"
    >
      <span aria-hidden="true" className="inline-grid place-items-center text-muted">
        {icon}
      </span>
      <span className="truncate">{children}</span>
      <kbd className={KEY}>{keys}</kbd>
    </button>
  )
}

/** The kind's icon in the kind's colour, at a chip's or a row's size. */
function ScopeIcon({ type, size = 12 }: { type: ObjectType; size?: 12 | 14 }) {
  const Icon = KIND_ICON[type]
  return <Icon size={size} aria-hidden="true" className={KIND_TEXT[type]} />
}

/** A kind's icon on its tint, the mark of a row whose kind has none of its own (artboard 9). */
function KindBadge({ type }: { type: ObjectType }) {
  return (
    <span className={`inline-grid size-6 place-items-center rounded-control ${KIND_TINT[type]}`}>
      <ScopeIcon type={type} size={14} />
    </span>
  )
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

function runLabel(run: Run, view: Tab, scope: ObjectType | null): string | null {
  if (run.group === 'recent') return 'Recent'
  if (run.group === 'place') return 'Go to'
  if (run.group === 'scope') return 'Only'
  if (run.type && view === 'all' && scope === null) return KIND_WORDS[run.type].many
  return null
}

function SearchRow({
  row,
  id,
  selected,
  compact,
  onChoose,
  onHover,
}: {
  row: Row
  id: string
  selected: boolean
  /** The picker's 380: no word column, the fact at its own width. */
  compact: boolean
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
        <KindBadge type={row.type} />
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
        <KindBadge type={row.type} />
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
      className={`${shared} ${
        compact
          ? 'grid-cols-[24px_minmax(0,1fr)_minmax(0,max-content)]'
          : 'grid-cols-[24px_minmax(0,1fr)_180px_92px]'
      }`}
    >
      <span className="inline-grid size-6 place-items-center">
        {row.mark ?? <KindBadge type={row.type} />}
      </span>
      <span className={`truncate ${selected && compact ? 'font-medium' : ''}`}>{row.title}</span>
      <span className={`min-w-0 truncate text-muted ${compact ? 'max-w-40' : ''}`}>{row.meta}</span>
      {/* The picker has no room for the word; its icon is aria-hidden, so the word is still said. */}
      {compact ? (
        <span className="sr-only">{row.word}</span>
      ) : (
        <span className="text-meta text-subtle">{row.word}</span>
      )}
    </li>
  )
}

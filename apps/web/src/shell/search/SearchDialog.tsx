import type { LinkCandidate, ObjectType } from '@ctws/contracts'
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useDebouncedValue } from '../../platform/time/useDebouncedValue'
import { useComposing } from '../../platform/keyboard/composition'
import { keyLabel } from '../../platform/keyboard/keys'
import { pressesWith, useKeyTable, type KeyTable } from '../../platform/keyboard/keyTable'
import { KEY } from '../../platform/ui/buttonStyles'
import { ForwardIcon, KIND_ICON, LinkIcon, NewIcon, PLACE_ICON } from '../../platform/ui/icons'
import { SkeletonRows } from '../../platform/ui/Block'
import { Modal } from '../../platform/ui/Modal'
import { useMe } from '../auth/useMe'
import { NewContext } from '../creates'
import { useInspector } from '../layout/inspectorAddress'
import { PLACES } from '../layout/places'
import { KIND_TEXT, KIND_TINT } from '../../platform/ui/kinds'
import type { SearchHit } from '../contract'
import { useRegistry } from '../registry'
import { everythingQuery, kindQuery } from './api'
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
  | { kind: 'new'; key: string; title: string; label: string }
  | { kind: 'all'; key: string; type: ObjectType; title: string }

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
  /** The thing being linked from: the answer leaves it out. Null for one not made yet. */
  of: Endpoint | null
  /** Offered first among what the words find (the capture's Inbox, FR-084). */
  first?: string | null
  title: string
  /** Offer this kind only, when the block it opened from holds one kind. */
  only?: ObjectType | undefined
  /** The chosen thing, with its line of why if one was written. */
  onPick: (thing: LinkCandidate, why: string | null) => void
  busy?: boolean
  /** Why the last pick did not take, said at the foot. */
  error?: string | null
  /** False for a pick that is the whole act (a move): no line of why is asked. */
  asksWhy?: boolean
  /** Things not to offer, though they would match: where it already is. */
  leaveOut?: readonly string[]
  /** The list's last row makes one under the words typed: "New person “priya”" (FR-055). */
  makes?: { label: string; run: (name: string) => void }
  /**
   * Things it can go further into (FR-059): their row ends in "›", and it or → shows the next
   * step in the same box, which "‹" or ← leaves.
   */
  drill?: {
    into: (thing: LinkCandidate) => boolean
    step: (thing: LinkCandidate, back: () => void, close: () => void) => ReactNode
  }
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
  // As a picker: the thing gone into, while its next step is shown.
  const [inside, setInside] = useState<LinkCandidate | null>(null)
  const navigate = useNavigate()
  const inspector = useInspector()
  const openNew = useContext(NewContext)
  const box = useRef<HTMLInputElement>(null)
  const whyBox = useRef<HTMLInputElement>(null)
  const base = useId()
  const listId = `${base}-results`
  const optionId = (i: number) => `${base}-option-${i}`

  const registry = useRegistry()
  // A thing as a row: the kind's own mark and fact, the components its module's rows use too.
  const thingHit = (c: LinkCandidate): SearchHit => {
    const relation = registry.relationFor(c.type)
    return {
      id: c.id,
      type: c.type,
      title: c.title,
      to: relation.found ? relation.found(c) : relation.to(c.id),
      meta: relation.Fact ? <relation.Fact thing={c} /> : null,
      mark: relation.Mark ? <relation.Mark thing={c} /> : null,
    }
  }
  // Every kind from one question (FR-024, `GET /search`): All, and the counts on the tabs; a kind
  // looked at alone is read a page at a time as the list is scrolled.
  const kindView: ObjectType | null = pick ? null : (scope ?? (tab === 'all' ? null : tab))
  const everything = useQuery({
    ...everythingQuery(debounced),
    enabled: !pick && debounced.length > 0 && scope === null,
    // While the words change, the last answer stays until the next is in (DES-001).
    placeholderData: keepPreviousData,
  })
  const oneKind = useInfiniteQuery({
    ...kindQuery(debounced, kindView ?? 'task'),
    enabled: !pick && debounced.length > 0 && kindView !== null,
    placeholderData: keepPreviousData,
  })
  const kindItems = (oneKind.data?.pages ?? []).flatMap((p) => p.groups[0]?.items ?? [])
  const totals = new Map((everything.data?.groups ?? []).map((g) => [g.type, g.total]))
  // A kind alone reads on as its end comes near, by scrolling or by the keyboard (DES-001).
  const readOn = () => {
    if (kindView && oneKind.hasNextPage && !oneKind.isFetchingNextPage) void oneKind.fetchNextPage()
  }
  const served: LinkCandidate[] = kindView
    ? kindItems
    : (everything.data?.groups ?? []).flatMap((g) => g.items)
  const asked = kindView ? oneKind : everything
  const found = {
    rows: served.map((c) => ({ ...thingHit(c), moduleId: '', moduleLabel: '' })),
    isError: asked.isError,
    isSuccess: asked.isSuccess && !asked.isPlaceholderData,
  }
  // As a picker (FR-027) the server's candidates are the hits: every kind, the likely few first.
  const candidates = useQuery({
    ...candidatesQuery(pick?.of ?? null, debounced),
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
  const hitsById = new Map((pick ? (candidates.data ?? []) : served).map((c) => [c.id, c]))
  // A task made from here goes to the inbox, as a captured line does.
  const capture = registry.captures.find((c) => c.moduleId === registry.captureModuleId)!
  const inbox = capture.capture.useTarget()
  // Read once when the dialog opens: the list must not reshuffle under the reader.
  const userId = useMe().data?.id
  const [recent] = useState(() => (userId ? recentList(userId) : []))

  const typing = query.trim()
  const typed = typing.toLocaleLowerCase()
  const scoping = scope === null && query.startsWith('/')
  const hits = (debounced.length > 0 || pick ? results.rows : [])
    .filter(
      (h) => ((scope ?? 'all') === 'all' || h.type === scope) && !pick?.leaveOut?.includes(h.id),
    )
    // The one asked for first leads; the rest keep the server's order.
    .sort((a, b) => Number(b.id === pick?.first) - Number(a.id === pick?.first))
  // A picker of one kind lists every one it finds, not five and an "All N".
  const view: Tab = pick ? (pick.only ?? 'all') : (scope ?? tab)
  const tabs: Tab[] = pick
    ? ['all', ...kindsWithHits(hits).map((k) => k.type)]
    : ['all', ...(everything.data?.groups ?? []).map((g) => g.type)]
  // The server's groups: All's first five a kind and how many more; a kind alone, all read so far.
  const groups = pick
    ? grouped(hits, view)
    : kindView
      ? [{ type: kindView, rows: hits, more: 0 }]
      : KIND_ORDER.flatMap((type) => {
          const rows = hits.filter((h) => h.type === type)
          return rows.length > 0
            ? [{ type, rows, more: (totals.get(type) ?? 0) - rows.length }]
            : []
        })

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
          ...groups.flatMap((g) => [
            ...g.rows.map((hit) => {
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
            // "All 23 people": the rest of a kind, its tab (DES-001 section 4).
            ...(g.more > 0 && view === 'all'
              ? [
                  {
                    kind: 'all' as const,
                    key: `all:${g.type}`,
                    type: g.type,
                    title: `All ${g.rows.length + g.more} ${KIND_WORDS[g.type].many.toLocaleLowerCase()}`,
                  },
                ]
              : []),
          ]),
          ...(pick?.makes && typing.length > 0 && !scoping
            ? [{ kind: 'new' as const, key: 'new', title: typing, label: pick.makes.label }]
            : []),
        ]
  // The debounced hits landing later keep it, or a row the keyboard already moved to would be lost
  // under the Enter about to choose it. A shorter result set must not leave it past the end.
  const active = picked.under === `${view}:${query}` ? picked.at : 0
  const at = Math.min(active, Math.max(rows.length - 1, 0))
  const setActive = (next: number) => {
    setPicked({ at: next, under: `${view}:${query}` })
    if (next >= rows.length - 3) readOn()
  }
  useEffect(() => {
    document.getElementById(optionId(at))?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId is fixed by useId; only a move of the selection scrolls.
  }, [at])
  useEffect(() => {
    if (chosen) whyBox.current?.focus()
  }, [chosen])

  const settled = typing === debounced
  // How many match, said once the typing stops (DES-001, search's last rule): the server's totals.
  const matched = pick
    ? hits.length
    : kindView
      ? (oneKind.data?.pages[0]?.groups[0]?.total ?? 0)
      : [...totals.values()].reduce((a, b) => a + b, 0)
  const nothing = debounced.length > 0 && !scoping && results.isSuccess && hits.length === 0
  // With nothing, what the page says: that nothing matches.
  const said = !(settled && debounced.length > 0 && !scoping && results.isSuccess)
    ? ''
    : nothing
      ? `No ${view === 'all' ? 'results' : KIND_WORDS[view].many.toLocaleLowerCase()} match “${debounced}”.`
      : `${matched} ${matched === 1 ? 'result' : 'results'}`
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
  // What a pointer picks here leaves the typing where it was: in the box (BUG-062).
  const scopeTo = (type: ObjectType) => {
    setScope(type)
    setTab('all')
    setQuery('')
    box.current?.focus()
  }
  const showTab = (t: Tab) => {
    setTab(t)
    box.current?.focus()
  }
  // `typed`: from the keyboard, a hit for words not yet sent would be the previous words' (wait);
  // a pointer chooses what it can see.
  const open = (row: Row, beside: boolean, typed = false) => {
    if (row.kind === 'scope') return scopeTo(row.type)
    if (row.kind === 'all') return showTab(row.type)
    if (row.kind === 'hit' && typed && !settled) return
    if (row.kind === 'new') {
      if (!pick?.busy) pick?.makes?.run(row.title)
      return
    }
    if (pick) {
      if (row.kind !== 'hit') return
      if (pick.asksWhy === false) {
        if (!pick.busy) pick.onPick(hitsById.get(row.id)!, null)
        return
      }
      setWhy('')
      setChosen(hitsById.get(row.id)!)
      return
    }
    onClose()
    if (beside && row.kind !== 'place') inspector.show({ type: row.type, id: row.id })
    else navigate(row.to)
  }

  const intoOf = (row: Row | undefined) => {
    const thing = row?.kind === 'hit' ? hitsById.get(row.id) : undefined
    return thing && pick?.drill?.into(thing) ? thing : null
  }
  const goInto = (thing: LinkCandidate) => {
    if (!pick?.busy) setInside(thing)
  }
  const comeBack = () => setInside(null)
  // Back from the next step, the box it left takes focus again, before the next key.
  const wasInside = useRef(false)
  useLayoutEffect(() => {
    if (wasInside.current && !inside) box.current?.focus()
    wasInside.current = inside !== null
  }, [inside])

  // The foot says only the keys that do something now (DES-001 section 4).
  const current = rows[at]
  const legends: [string, string][] = []
  if (current) {
    legends.push([
      'Enter',
      current.kind === 'scope'
        ? 'Scope to it'
        : current.kind === 'new'
          ? (pick?.makes?.label ?? '')
          : pick
            ? 'Choose'
            : current.kind === 'place'
              ? 'Go'
              : 'Open',
    ])
    if (!pick && (current.kind === 'hit' || current.kind === 'recent'))
      legends.push([keyLabel('Ctrl Enter'), 'Open beside'])
    if (intoOf(current)) legends.push(['→', 'Inside'])
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
      {pick?.drill && inside && pick.drill.step(inside, comeBack, onClose)}
      {/* Kept while the next step is shown: back, its words and place are as they were. */}
      <div className={pick?.drill && inside ? 'hidden' : 'contents'}>
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
              // → at the end of the words goes into the row's thing, where it has a next step.
              const into = intoOf(rows[at])
              if (
                e.key === 'ArrowRight' &&
                into &&
                !e.altKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.shiftKey &&
                e.currentTarget.selectionStart === query.length
              ) {
                e.preventDefault()
                goInto(into)
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
          {!pick && <kbd className={`${KEY} max-lg:hidden`}>Esc</kbd>}
          {/* A phone has no Esc: the full screen closes here (FR-088). */}
          <button type="button" onClick={onClose} className="text-ui text-muted lg:hidden">
            Cancel
          </button>
        </div>

        {totals.size > 0 && scope === null && !scoping && !pick && (
          <div
            role="tablist"
            className="flex gap-0.5 overflow-hidden border-b border-line px-2.5 py-1.5"
          >
            {tabs.map((t) => {
              // Totals, from the server (FR-024); a big one is said as 999+.
              const n =
                t === 'all' ? [...totals.values()].reduce((a, b) => a + b, 0) : (totals.get(t) ?? 0)
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  // Read as "Tasks, 12" (DES-001): the name and its total, one phrase.
                  aria-label={`${t === 'all' ? 'All' : KIND_WORDS[t].many}, ${n > 999 ? '999+' : n}`}
                  aria-selected={view === t}
                  tabIndex={-1}
                  onClick={() => showTab(t)}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 text-meta font-medium whitespace-nowrap ${
                    view === t ? 'bg-select text-ink' : 'text-muted hover:bg-hover'
                  }`}
                >
                  {t !== 'all' && <ScopeIcon type={t} size={14} />}
                  {t === 'all' ? 'All' : KIND_WORDS[t].many}
                  <span className="font-normal text-subtle tabular-nums">
                    {n > 999 ? '999+' : n}
                  </span>
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
                onClick={() => {
                  setScope(null)
                  box.current?.focus()
                }}
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

        <p className="sr-only" aria-live="polite">
          {said}
        </p>
        {/* The options are not buttons: focus stays in the box, and `aria-activedescendant` walks
          the list without adding a tab stop per result. */}
        <ul
          id={listId}
          role="listbox"
          aria-label={`Results, ${view === 'all' ? 'all kinds' : KIND_WORDS[view].many.toLocaleLowerCase()}`}
          onScroll={(e) => {
            const list = e.currentTarget
            if (list.scrollHeight - list.scrollTop - list.clientHeight < 80) readOn()
          }}
          className="max-h-[52vh] overflow-y-auto pb-1.5 max-lg:max-h-none max-lg:min-h-0 max-lg:flex-1"
        >
          {runs(rows).map((run) => {
            const options = run.rows.map((row, j) => (
              <SearchRow
                key={row.key}
                row={row}
                words={debounced}
                id={optionId(run.start + j)}
                selected={
                  chosen ? row.kind === 'hit' && row.id === chosen.id : run.start + j === at
                }
                compact={pick !== undefined}
                onChoose={() => open(row, false)}
                {...(intoOf(row) ? { onInto: () => goInto(intoOf(row)!) } : {})}
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
          {/* Two grey rows while the next page of a kind is on its way. */}
          {kindView && oneKind.isFetchingNextPage && (
            <li role="presentation" aria-hidden="true" className="px-1">
              <SkeletonRows rows={2} />
            </li>
          )}
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
          <>
            {/* A pick that is the whole act says here why it did not take (a refused move). */}
            {pick?.error && (
              <p role="alert" className="border-t border-line px-3.5 py-2.5 text-ui text-stop-t">
                {pick.error}
              </p>
            )}
            {legends.length > 0 && (
              <div className="flex h-10 items-center gap-4 border-t border-line px-4 text-meta text-subtle max-lg:hidden">
                {legends.map(([k, does]) => (
                  <Legend key={`${k}:${does}`} keys={k}>
                    {does}
                  </Legend>
                ))}
              </div>
            )}
          </>
        )}
      </div>
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
    const type = row.kind === 'hit' || row.kind === 'all' ? row.type : undefined
    const key = type ? `hit:${type}` : row.kind
    const last = out[out.length - 1]
    if (last && last.key === key) last.rows.push(row)
    else
      out.push({ key, group: row.kind === 'all' ? 'hit' : row.kind, type, start: i, rows: [row] })
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
  words,
  id,
  selected,
  compact,
  onChoose,
  onHover,
  onInto,
}: {
  row: Row
  id: string
  /** What was typed, marked where a title matches it (S-01). */
  words: string
  selected: boolean
  /** The picker's 380: no word column, the fact at its own width. */
  compact: boolean
  onChoose: () => void
  onHover: () => void
  /** Its next step, where it has one: the "›" at the row's end (FR-059). */
  onInto?: () => void
}) {
  // Read as "name, fact, kind" (DES-001), from the columns as drawn: the fact is a module's own
  // component, so its words are only known once it is on the page.
  const said = useRef<HTMLLIElement>(null)
  const [label, setLabel] = useState<string | undefined>(undefined)
  useLayoutEffect(() => {
    const parts = [...(said.current?.querySelectorAll('[data-said]') ?? [])]
      .map(spoken)
      .filter((t) => t.length > 0)
    setLabel(parts.length > 0 ? parts.join(', ') : undefined)
  }, [row, words])
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
  if (row.kind === 'new')
    return (
      <li
        id={id}
        role="option"
        aria-selected={selected}
        onClick={onChoose}
        onMouseEnter={onHover}
        className={`${shared} grid-cols-[24px_minmax(0,1fr)]`}
      >
        <span aria-hidden="true" className="inline-grid size-6 place-items-center text-muted">
          <NewIcon size={16} />
        </span>
        <span className="truncate">
          {row.label} “{row.title}”
        </span>
      </li>
    )
  if (row.kind === 'all')
    return (
      <li
        id={id}
        role="option"
        aria-label={`${row.title}, switch to ${KIND_WORDS[row.type].many}`}
        aria-selected={selected}
        data-search-all={row.type}
        onClick={onChoose}
        onMouseEnter={onHover}
        className={`${shared} grid-cols-[24px_minmax(0,1fr)] text-muted`}
      >
        <span />
        <span className="text-meta">{row.title}</span>
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
        <span className="truncate">
          <Matched text={row.title} words={words} />
        </span>
        <span className="text-meta text-subtle">{KIND_WORDS[row.type].one}</span>
      </li>
    )
  return (
    <li
      ref={said}
      id={id}
      role="option"
      aria-label={label}
      data-search-result={row.id}
      aria-selected={selected}
      onClick={onChoose}
      onMouseEnter={onHover}
      className={`${shared} ${
        compact
          ? onInto
            ? 'grid-cols-[24px_minmax(0,1fr)_minmax(0,max-content)_24px] pr-2'
            : 'grid-cols-[24px_minmax(0,1fr)_minmax(0,max-content)]'
          : 'grid-cols-[24px_minmax(0,1fr)_180px_92px]'
      }`}
    >
      <span className="inline-grid size-6 place-items-center">
        {row.mark ?? <KindBadge type={row.type} />}
      </span>
      <span data-said className="truncate">
        <Matched text={row.title} words={words} />
      </span>
      <span data-said className={`min-w-0 truncate text-muted ${compact ? 'max-w-40' : ''}`}>
        {row.meta}
      </span>
      {/* The picker has no room for the word; its icon is aria-hidden, so the word is still said. */}
      {compact ? (
        <span data-said className="sr-only">
          {row.word}
        </span>
      ) : (
        <span data-said className="text-meta text-subtle">
          {row.word}
        </span>
      )}
      {onInto && (
        // A pointer's way in; the keyboard's is →, from the box, which keeps focus.
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Inside “${row.title}”`}
          title="Inside  →"
          onClick={(e) => {
            e.stopPropagation()
            onInto()
          }}
          className="inline-grid size-6 place-items-center rounded-control text-muted hover:bg-hover hover:text-ink"
        >
          <ForwardIcon size={16} aria-hidden="true" />
        </button>
      )}
    </li>
  )
}

/**
 * A title with what was typed marked in it (S-01): each word typed, wherever it falls, in the
 * row's 500 weight; the rest as it is.
 */
function Matched({ text, words }: { text: string; words: string }) {
  const typed = words
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0)
  if (typed.length === 0) return text
  const lower = text.toLocaleLowerCase()
  const marked = new Array<boolean>(text.length).fill(false)
  for (const word of typed)
    for (let from = lower.indexOf(word); from >= 0; from = lower.indexOf(word, from + 1))
      marked.fill(true, from, from + word.length)
  const parts: { text: string; marked: boolean }[] = []
  for (let i = 0; i < text.length; i++) {
    const last = parts.at(-1)
    if (last && last.marked === marked[i]) last.text += text[i]
    else parts.push({ text: text[i]!, marked: marked[i]! })
  }
  return parts.map((p, i) =>
    p.marked ? (
      <mark key={i} className="bg-transparent font-medium text-ink">
        {p.text}
      </mark>
    ) : (
      p.text
    ),
  )
}

/** An element's words as a screen reader has them: what is aria-hidden left out. */
function spoken(el: Element): string {
  const copy = el.cloneNode(true) as Element
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove()
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
}

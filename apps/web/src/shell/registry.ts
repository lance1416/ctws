import {
  type CalendarEntry,
  OBJECT_TYPES,
  type ObjectType,
  type ProjectId,
  type ProjectResponse,
} from '@ctws/contracts'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { createContext, useContext, type ComponentType } from 'react'
import { refreshQueries, type StaleFor } from '../platform/http/refresh'
import type { RouteObject } from 'react-router-dom'
import type {
  CalendarContribution,
  CaptureContribution,
  Chord,
  Creator,
  KindEntry,
  ModulePage,
  PersonContribution,
  ProjectContribution,
  Reads,
  RelationContribution,
  ShownEntry,
  TodayBlock,
  Widget,
  WorkspaceModule,
} from './contract'
import type { KeyTable } from '../platform/keyboard/keyTable'
import { useTimeZone } from './auth/useMe'
import { said } from './calendar/said'
import { linkKeys } from './links/api'
import { timelineKeys } from './timeline/Timeline'
import { CommunicationFact, OrganisationFact } from './links/ShellFacts'
import { projectKeys } from './projects/api'
import { ProjectsCount, ProjectsStatus } from './projects/ProjectKind'
import { anywhereKeys, type AnywhereAction } from './shortcuts/keys'

export const WORKBENCH_PATH = '/'

const SHELL_CHORDS: Chord[] = [
  { id: 'workbench', key: 'w', label: 'Workbench', resolve: () => WORKBENCH_PATH, order: 5 },
  { id: 'calendar', key: 'c', label: 'Calendar', resolve: () => '/calendar', order: 15 },
  { id: 'projects', key: 'p', label: 'Projects', resolve: () => '/projects', order: 25 },
  // Their modules come in phase 3; the bar and the keys already lead to their places.
  {
    id: 'organisations',
    key: 'o',
    label: 'Organisations',
    resolve: () => '/organisations',
    order: 35,
  },
  {
    id: 'communication',
    key: 'x',
    label: 'Communication',
    resolve: () => '/communication',
    order: 45,
  },
  { id: 'notes', key: 'n', label: 'Notes', resolve: () => '/notes', order: 55 },
]

const SHELL_PAGES: ModulePage[] = [
  { id: 'workbench', to: WORKBENCH_PATH, label: 'Workbench', end: true, chord: 'workbench' },
  { id: 'calendar', to: '/calendar', label: 'Calendar', chord: 'calendar' },
]

const PROJECTS_KIND: KindEntry = {
  label: 'Projects',
  to: '/projects',
  Count: ProjectsCount,
  Status: ProjectsStatus,
  chord: 'projects',
}

const SHELL_RELATIONS: RelationContribution[] = [
  { type: 'project', kind: 'Project', plural: 'Projects', to: (id) => `/projects/${id}` },
  // Until the organisations module arrives in the web app (phase 3), the shell answers for it.
  {
    type: 'organisation',
    kind: 'Organisation',
    plural: 'Organisations',
    to: (id) => `/organisations/${id}`,
    Fact: OrganisationFact,
  },
  {
    type: 'communication',
    kind: 'Communication',
    plural: 'Communication',
    to: (id) => `/communication/${id}`,
    Fact: CommunicationFact,
  },
  { type: 'note', kind: 'Note', plural: 'Notes', to: (id) => `/notes/${id}` },
]

/** The kinds whose modules come in phase 3: `N` and the menu already lead to their places. */
const SHELL_CREATES: Creator[] = [
  { kind: 'organisation', key: 'o', label: 'Organisation', to: '/organisations' },
  { kind: 'communication', key: 'x', label: 'Communication', to: '/communication' },
  { kind: 'note', key: 'n', label: 'Note', to: '/notes' },
]

/** What the app, not the shell, decides about its modules. */
export type ShellConfig = {
  /** The rail's top tier, as `<module id or 'shell'>:<page id>`, at most five. */
  pinned: readonly string[]
  /** The phone bar's day tab, as `<module id>:<page id>`: offered, pinned or not. */
  phoneTab: string
  /** Where a captured line goes when no module claims it. */
  captureModuleId: string
}

type PinnedPage = ModulePage & { key: string }
/** `moduleId` is null for the shell's own entries. */
type RegisteredKind = KindEntry & { moduleId: string | null }
type RegisteredRelation = RelationContribution & { moduleId: string | null }
type RegisteredWidget = Widget & { moduleId: string }
type SearchProvider = { moduleId: string; moduleLabel: string } & NonNullable<
  WorkspaceModule['search']
>
type CalendarProvider = {
  moduleId: string
  label: string
  /** A hook: the module's entries for an inclusive day range, as the shell draws them. */
  useEntries: (range: { from: string; to: string }) => {
    entries: ShownEntry[]
    isError: boolean
    retry: () => void
  }
  opens?: CalendarContribution['opens']
}

/** One entry's name on a grid: which thing, which date of it, and which occurrence. */
const entryKey = (e: CalendarEntry): string =>
  [e.type, e.id, e.kind, e.day, e.recurrenceId ?? ''].join(':')

/** A module's calendar, its entries said and given the module's route and words. */
function calendarProvider(moduleId: string, c: CalendarContribution): CalendarProvider {
  return {
    moduleId,
    label: c.label,
    ...(c.opens ? { opens: c.opens } : {}),
    useEntries: function useShownEntries(range) {
      const accountZone = useTimeZone()
      const { entries, isError, retry } = c.useEntries(range)
      return {
        isError,
        retry,
        entries: entries.map((e) => {
          const one = said(e, accountZone)
          return { ...one, ...c.show(one), key: entryKey(e) }
        }),
      }
    },
  }
}
type RegisteredProjectMain = { moduleId: string; moduleLabel: string } & NonNullable<
  ProjectContribution['Main']
>

export type Registry = {
  pinned: PinnedPage[]
  phoneTab: PinnedPage
  /** The shell's own Projects first. */
  kinds: RegisteredKind[]
  chords: Chord[]
  chordFor: (key: string) => Chord | null
  /** Every creator, modules' first, in FR-029's order of keys. */
  creates: Creator[]
  creatorFor: (key: string) => Creator | null
  captures: { moduleId: string; capture: CaptureContribution }[]
  captureModuleId: string
  search: SearchProvider[]
  calendar: CalendarProvider[]
  widgets: RegisteredWidget[]
  /** Today's right column, every module's, in order. */
  todayBlocks: (TodayBlock & { moduleId: string })[]
  relations: RegisteredRelation[]
  relationFor: (type: ObjectType) => RegisteredRelation
  projectMain: RegisteredProjectMain | null
  /** Each module's own things in a project, by the kind they are. */
  projectThings: (NonNullable<ProjectContribution['Things']> & { moduleId: string })[]
  personThings: (NonNullable<PersonContribution['Things']> & { moduleId: string })[]
  personLinked: NonNullable<PersonContribution['Linked']>[]
  projectTileFacts: { moduleId: string; Facts: ComponentType<{ project: ProjectResponse }> }[]
  projectCard: NonNullable<ProjectContribution['Card']> | null
  projectOutline: ComponentType<{ projectId: ProjectId }> | null
  projectCount: ((project: ProjectResponse) => number) | null
  projectContents: NonNullable<ProjectContribution['contents']>[]
  /** The page-wide keys: capture, search, this help, the jumps. */
  anywhere: KeyTable<AnywhereAction>
  /** Every module's key tables, in module order. */
  keys: KeyTable[]
  routes: RouteObject[]
  /** The query keys a write that changes these kinds of thing leaves stale. */
  staleFor: StaleFor
}

const byOrder = <T extends { order?: number }>(a: T, b: T) => (a.order ?? 50) - (b.order ?? 50)

/**
 * Everything the shell reads off the modules, derived once. The module list must not change at
 * runtime: the shell calls one hook per contribution.
 */
export function buildRegistry(modules: readonly WorkspaceModule[], config: ShellConfig): Registry {
  const offered = new Map<string, ModulePage>([
    ...SHELL_PAGES.map((p) => [`shell:${p.id}`, p] as const),
    ...modules.flatMap((m) => (m.pages ?? []).map((p) => [`${m.id}:${p.id}`, p] as const)),
  ])
  const chords = [...SHELL_CHORDS, ...modules.flatMap((m) => m.chords ?? [])].sort(
    (a, b) => a.order - b.order,
  )
  const relations: RegisteredRelation[] = [
    ...SHELL_RELATIONS.map((r) => ({ ...r, moduleId: null })),
    ...modules.flatMap((m) => (m.relations ?? []).map((r) => ({ ...r, moduleId: m.id }))),
  ]
  const NEW_ORDER = 'tmpoxrnl'
  const creates = [...modules.flatMap((m) => m.creates ?? []), ...SHELL_CREATES].sort(
    (a, b) => NEW_ORDER.indexOf(a.key) - NEW_ORDER.indexOf(b.key),
  )
  const captures = modules.flatMap((m) =>
    m.capture ? [{ moduleId: m.id, capture: m.capture }] : [],
  )
  if (!captures.some((c) => c.moduleId === config.captureModuleId)) {
    throw new Error(`capture module "${config.captureModuleId}" is not registered`)
  }
  const phoneTab = offered.get(config.phoneTab)
  if (!phoneTab) throw new Error(`phone tab "${config.phoneTab}" is not offered`)
  // The account (`me`), a day's lunar name and a city's spelling change with no write here.
  const reads: Reads[] = [
    // An edge's far end can be anything, and the list shows its name.
    { queryKey: linkKeys.all, of: OBJECT_TYPES },
    // A timeline holds a thing's changes and whatever is said about it: any write may add a line.
    { queryKey: timelineKeys.all, of: OBJECT_TYPES },
    {
      queryKey: projectKeys.all,
      of: ['project', ...modules.flatMap((m) => m.project?.counts ?? [])],
    },
    ...modules.flatMap((m) => m.reads),
  ]

  return {
    pinned: config.pinned.flatMap((key) => {
      const page = offered.get(key)
      return page ? [{ ...page, key }] : []
    }),
    phoneTab: { ...phoneTab, key: config.phoneTab },
    kinds: [
      { ...PROJECTS_KIND, moduleId: null },
      ...modules.flatMap((m) => (m.kind ? [{ ...m.kind, moduleId: m.id }] : [])).sort(byOrder),
    ],
    chords,
    chordFor: (key) => chords.find((c) => c.key === key) ?? null,
    creates,
    creatorFor: (key) => creates.find((c) => c.key === key) ?? null,
    captures,
    captureModuleId: config.captureModuleId,
    search: modules.flatMap((m) =>
      m.search ? [{ moduleId: m.id, moduleLabel: m.label, useHits: m.search.useHits }] : [],
    ),
    calendar: modules.flatMap((m) => (m.calendar ? [calendarProvider(m.id, m.calendar)] : [])),
    widgets: modules
      .flatMap((m) => (m.widgets ?? []).map((w) => ({ ...w, moduleId: m.id })))
      .sort(byOrder),
    todayBlocks: modules
      .flatMap((m) => (m.today ?? []).map((b) => ({ ...b, moduleId: m.id })))
      .sort((a, b) => a.order - b.order),
    relations,
    relationFor: (type) => {
      const found = relations.find((r) => r.type === type)
      if (!found) throw new Error(`no module says where a ${type} lives`)
      return found
    },
    personLinked: modules.flatMap((m) => (m.person?.Linked ? [m.person.Linked] : [])),
    personThings: modules.flatMap((m) =>
      m.person?.Things ? [{ moduleId: m.id, ...m.person.Things }] : [],
    ),
    projectThings: modules.flatMap((m) =>
      m.project?.Things ? [{ moduleId: m.id, ...m.project.Things }] : [],
    ),
    projectMain: (() => {
      const m = modules.find((x) => x.project?.Main)
      return m?.project?.Main ? { moduleId: m.id, moduleLabel: m.label, ...m.project.Main } : null
    })(),
    projectTileFacts: modules.flatMap((m) =>
      m.project?.TileFacts ? [{ moduleId: m.id, Facts: m.project.TileFacts }] : [],
    ),
    projectCard: modules.find((m) => m.project?.Card)?.project?.Card ?? null,
    projectOutline: modules.find((m) => m.project?.Outline)?.project?.Outline ?? null,
    projectCount: modules.find((m) => m.project?.count)?.project?.count ?? null,
    projectContents: modules.flatMap((m) => (m.project?.contents ? [m.project.contents] : [])),
    anywhere: anywhereKeys(chords, creates),
    keys: modules.flatMap((m) => m.keys ?? []),
    routes: [
      ...modules.flatMap((m) => m.places ?? []),
      ...modules.map((m) => ({ path: `/${m.id}`, children: m.routes })),
    ],
    staleFor: (changes) =>
      reads.filter((r) => r.of.some((type) => changes.includes(type))).map((r) => r.queryKey),
  }
}

const RegistryContext = createContext<Registry | null>(null)
export const RegistryProvider = RegistryContext.Provider

export function useRegistry(): Registry {
  const registry = useContext(RegistryContext)
  if (!registry) throw new Error('useRegistry needs a RegistryProvider')
  return registry
}

/**
 * Refreshes after a write made outside a mutation: the queries that read what it `changes`, and
 * resolves once the `awaits` ones are back.
 */
export function useRefresh() {
  const qc = useQueryClient()
  const { staleFor } = useRegistry()
  return (changes: readonly ObjectType[], awaits?: readonly QueryKey[]) =>
    refreshQueries(qc, staleFor(changes), awaits)
}

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
  InspectorList,
  KindEntry,
  ModulePage,
  PersonContribution,
  ProjectContribution,
  Reads,
  RelationContribution,
  ShownEntry,
  TodayBlock,
  WeekCount,
  Widget,
  WorkbenchPlace,
  WorkspaceModule,
} from './contract'
import type { KeyTable } from '../platform/keyboard/keyTable'
import { useTimeZone } from './auth/useMe'
import { said } from './calendar/said'
import { linkKeys } from './links/api'
import { resourceKeys } from './resources/api'
import { weekCountKeys } from './review/api'
import { timelineKeys } from './timeline/Timeline'
import { projectKeys } from './projects/api'
import { ProjectNarrow } from './projects/ProjectNarrow'
import {
  ProjectListMark,
  ProjectsCount,
  ProjectsMoreCount,
  ProjectsStatus,
} from './projects/ProjectKind'
import { anywhereKeys, type AnywhereAction } from './shortcuts/keys'

export const WORKBENCH_PATH = '/'

const SHELL_CHORDS: Chord[] = [
  { id: 'workbench', key: 'w', label: 'Workbench', resolve: () => WORKBENCH_PATH, order: 5 },
  { id: 'calendar', key: 'c', label: 'Calendar', resolve: () => '/calendar', order: 15 },
  { id: 'projects', key: 'p', label: 'Projects', resolve: () => '/projects', order: 25 },
]

const SHELL_PAGES: ModulePage[] = [
  { id: 'workbench', to: WORKBENCH_PATH, label: 'Workbench', end: true, chord: 'workbench' },
  { id: 'calendar', to: '/calendar', label: 'Calendar', chord: 'calendar' },
]

const PROJECTS_KIND: KindEntry = {
  label: 'Projects',
  to: '/projects',
  Count: ProjectsCount,
  MoreCount: ProjectsMoreCount,
  Status: ProjectsStatus,
  chord: 'projects',
}

const SHELL_RELATIONS: RelationContribution[] = [
  {
    type: 'project',
    kind: 'Project',
    plural: 'Projects',
    to: (id) => `/projects/${id}`,
    Narrow: ProjectNarrow,
    Mark: ProjectListMark,
    edit: (id) => `/projects/${id}/edit`,
  },
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
export type RegisteredRelation = RelationContribution & { moduleId: string | null }
type RegisteredWidget = Widget & { moduleId: string }
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

/** Each workbench place and the one module's widget that fills it; a second for a place is a mistake. */
function placed(
  modules: readonly WorkspaceModule[],
): Partial<Record<WorkbenchPlace, RegisteredWidget>> {
  const out: Partial<Record<WorkbenchPlace, RegisteredWidget>> = {}
  for (const m of modules)
    for (const w of m.widgets ?? []) {
      const taken = out[w.place]
      if (taken)
        throw new Error(`"${m.id}" and "${taken.moduleId}" both fill the workbench's ${w.place}`)
      out[w.place] = { ...w, moduleId: m.id }
    }
  return out
}

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
  calendar: CalendarProvider[]
  /** What fills each of the workbench's places, by the module that fills it (FR-076). */
  widgets: Partial<Record<WorkbenchPlace, RegisteredWidget>>
  /** Today's right column, every module's, in order. */
  todayBlocks: (TodayBlock & { moduleId: string })[]
  /** The sidebars of pages across kinds, by the page's address. */
  pageSidebars: Record<string, NonNullable<ModulePage['Sidebar']>>
  /** What the review counts of a week, every module's, in order (FR-081). */
  weekCounts: WeekCount[]
  relations: RegisteredRelation[]
  relationFor: (type: ObjectType) => RegisteredRelation
  /** The modules' full lists for the inspector, by name; none when no module has it. */
  listFor: (name: string) => InspectorList | null
  projectMain: RegisteredProjectMain | null
  /** Each module's own things in a project, by the kind they are. */
  projectThings: (NonNullable<ProjectContribution['Things']> & { moduleId: string })[]
  personThings: (NonNullable<PersonContribution['Things']> & { moduleId: string })[]
  personLinked: NonNullable<PersonContribution['Linked']>[]
  projectCard: NonNullable<ProjectContribution['Card']> | null
  projectOutline: ComponentType<{ projectId: ProjectId }> | null
  projectNarrow: ComponentType<{ projectId: ProjectId }> | null
  projectCount: ((project: ProjectResponse) => number) | null
  projectParents: NonNullable<ProjectContribution['Parents']> | null
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
  const creates = modules
    .flatMap((m) => m.creates ?? [])
    .sort((a, b) => NEW_ORDER.indexOf(a.key) - NEW_ORDER.indexOf(b.key))
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
    // What the launcher shows is pinned on a project, or archived with it.
    { queryKey: resourceKeys.pinned, of: ['project'] },
    // A timeline holds a thing's changes and whatever is said about it: any write may add a line.
    { queryKey: timelineKeys.all, of: OBJECT_TYPES },
    // The review's counts are of every module's things.
    { queryKey: weekCountKeys.all, of: OBJECT_TYPES },
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
    calendar: modules.flatMap((m) => (m.calendar ? [calendarProvider(m.id, m.calendar)] : [])),
    widgets: placed(modules),
    todayBlocks: modules
      .flatMap((m) => (m.today ?? []).map((b) => ({ ...b, moduleId: m.id })))
      .sort((a, b) => a.order - b.order),
    pageSidebars: Object.fromEntries(
      [...offered.values()].flatMap((p) => (p.Sidebar ? [[p.to, p.Sidebar] as const] : [])),
    ),
    weekCounts: modules.flatMap((m) => m.weekCounts ?? []).sort((a, b) => a.order - b.order),
    relations,
    listFor: (name) => modules.flatMap((m) => m.lists ?? []).find((l) => l.name === name) ?? null,
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
    projectCard: modules.find((m) => m.project?.Card)?.project?.Card ?? null,
    projectOutline: modules.find((m) => m.project?.Outline)?.project?.Outline ?? null,
    projectNarrow: modules.find((m) => m.project?.Narrow)?.project?.Narrow ?? null,
    projectCount: modules.find((m) => m.project?.count)?.project?.count ?? null,
    projectParents: modules.find((m) => m.project?.Parents)?.project?.Parents ?? null,
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

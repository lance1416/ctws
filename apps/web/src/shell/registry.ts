import { type ObjectType, type ProjectId } from '@ctws/contracts'
import { createContext, useContext, type ComponentType } from 'react'
import type { RouteObject } from 'react-router-dom'
import type {
  CalendarContribution,
  CaptureContribution,
  Chord,
  HelpSection,
  KindEntry,
  ModulePage,
  ProjectContribution,
  RelationContribution,
  Widget,
  WorkspaceModule,
} from './contract'
import { ProjectsCount, ProjectsStatus } from './projects/ProjectKind'

export const WORKBENCH_PATH = '/'

const SHELL_CHORDS: Chord[] = [
  { id: 'workbench', key: 'w', label: 'Go to Workbench', resolve: () => WORKBENCH_PATH, order: 5 },
  { id: 'calendar', key: 'c', label: 'Go to Calendar', resolve: () => '/calendar', order: 18 },
  { id: 'projects', key: 'p', label: 'Go to Projects', resolve: () => '/projects', order: 20 },
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
  { type: 'project', kind: 'Project', to: (id) => `/projects/${id}` },
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
type CalendarProvider = { moduleId: string } & CalendarContribution
type RegisteredProjectBlock = { moduleId: string; moduleLabel: string } & NonNullable<
  ProjectContribution['Block']
>

export type Registry = {
  pinned: PinnedPage[]
  phoneTab: PinnedPage
  /** The shell's own Projects first. */
  kinds: RegisteredKind[]
  chords: Chord[]
  chordFor: (key: string) => Chord | null
  captures: { moduleId: string; capture: CaptureContribution }[]
  captureModuleId: string
  search: SearchProvider[]
  calendar: CalendarProvider[]
  widgets: RegisteredWidget[]
  relations: RegisteredRelation[]
  relationFor: (type: ObjectType) => RegisteredRelation
  projectBlocks: RegisteredProjectBlock[]
  projectHeadlines: { moduleId: string; Component: ComponentType<{ projectId: ProjectId }> }[]
  projectFacts: { moduleId: string; Facts: NonNullable<ProjectContribution['Facts']> }[]
  projectLead: ComponentType<{ projectId: ProjectId }> | null
  projectContents: NonNullable<ProjectContribution['contents']>[]
  help: HelpSection[]
  routes: RouteObject[]
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
  const captures = modules.flatMap((m) =>
    m.capture ? [{ moduleId: m.id, capture: m.capture }] : [],
  )
  if (!captures.some((c) => c.moduleId === config.captureModuleId)) {
    throw new Error(`capture module "${config.captureModuleId}" is not registered`)
  }
  const phoneTab = offered.get(config.phoneTab)
  if (!phoneTab) throw new Error(`phone tab "${config.phoneTab}" is not offered`)

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
    captures,
    captureModuleId: config.captureModuleId,
    search: modules.flatMap((m) =>
      m.search ? [{ moduleId: m.id, moduleLabel: m.label, useHits: m.search.useHits }] : [],
    ),
    calendar: modules.flatMap((m) => (m.calendar ? [{ moduleId: m.id, ...m.calendar }] : [])),
    widgets: modules
      .flatMap((m) => (m.widgets ?? []).map((w) => ({ ...w, moduleId: m.id })))
      .sort(byOrder),
    relations,
    relationFor: (type) => {
      const found = relations.find((r) => r.type === type)
      if (!found) throw new Error(`no module says where a ${type} lives`)
      return found
    },
    projectBlocks: modules.flatMap((m) =>
      m.project?.Block ? [{ moduleId: m.id, moduleLabel: m.label, ...m.project.Block }] : [],
    ),
    projectHeadlines: modules.flatMap((m) =>
      m.project?.Headline ? [{ moduleId: m.id, Component: m.project.Headline }] : [],
    ),
    projectFacts: modules.flatMap((m) =>
      m.project?.Facts ? [{ moduleId: m.id, Facts: m.project.Facts }] : [],
    ),
    projectLead: modules.find((m) => m.project?.Lead)?.project?.Lead ?? null,
    projectContents: modules.flatMap((m) => (m.project?.contents ? [m.project.contents] : [])),
    help: modules.flatMap((m) => m.help ?? []),
    routes: modules.map((m) => ({ path: `/${m.id}`, children: m.routes })),
  }
}

const RegistryContext = createContext<Registry | null>(null)
export const RegistryProvider = RegistryContext.Provider

export function useRegistry(): Registry {
  const registry = useContext(RegistryContext)
  if (!registry) throw new Error('useRegistry needs a RegistryProvider')
  return registry
}

import type { ObjectType } from '@ctws/contracts'
import { createContext, useContext, type ComponentType } from 'react'
import type { RouteObject } from 'react-router-dom'
import type {
  CalendarContribution,
  CaptureContribution,
  Chord,
  KindEntry,
  ModulePage,
  RelationContribution,
  Widget,
  WorkspaceModule,
} from './contract'
import { ProjectsCount, ProjectsStatus } from './projects/ProjectKind'

/** The shell's front page: every module's glance side by side. */
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
  /** Where a captured line goes when no module claims it. */
  captureModuleId: string
}

export type PinnedPage = ModulePage & { key: string }
/** `moduleId` is null for the shell's own entries. */
export type RegisteredKind = KindEntry & { moduleId: string | null }
export type RegisteredChord = Chord & { moduleId: string | null }
export type RegisteredRelation = RelationContribution & { moduleId: string | null }
export type RegisteredWidget = Widget & { moduleId: string; moduleLabel: string }
export type SearchProvider = { moduleId: string; moduleLabel: string } & NonNullable<
  WorkspaceModule['search']
>
export type CalendarProvider = { moduleId: string } & CalendarContribution
export type RegisteredProjectBlock = { moduleId: string; moduleLabel: string } & NonNullable<
  WorkspaceModule['projectBlock']
>

export type Registry = {
  pinned: PinnedPage[]
  kinds: RegisteredKind[]
  chords: RegisteredChord[]
  chordFor: (key: string) => RegisteredChord | null
  captures: { moduleId: string; capture: CaptureContribution }[]
  captureModuleId: string
  search: SearchProvider[]
  calendar: CalendarProvider[]
  widgets: RegisteredWidget[]
  relations: RegisteredRelation[]
  relationFor: (type: ObjectType) => RegisteredRelation | null
  projectBlocks: RegisteredProjectBlock[]
  projectHeadlines: { moduleId: string; Component: ComponentType<{ projectId: string }> }[]
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
  const chords: RegisteredChord[] = [
    ...SHELL_CHORDS.map((c) => ({ ...c, moduleId: null })),
    ...modules.flatMap((m) => (m.chords ?? []).map((c) => ({ ...c, moduleId: m.id }))),
  ].sort((a, b) => a.order - b.order)
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

  return {
    pinned: config.pinned.flatMap((key) => {
      const page = offered.get(key)
      return page ? [{ ...page, key }] : []
    }),
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
      .flatMap((m) =>
        (m.widgets ?? []).map((w) => ({ ...w, moduleId: m.id, moduleLabel: m.label })),
      )
      .sort(byOrder),
    relations,
    relationFor: (type) => relations.find((r) => r.type === type) ?? null,
    projectBlocks: modules.flatMap((m) =>
      m.projectBlock ? [{ moduleId: m.id, moduleLabel: m.label, ...m.projectBlock }] : [],
    ),
    projectHeadlines: modules.flatMap((m) =>
      m.ProjectHeadline ? [{ moduleId: m.id, Component: m.ProjectHeadline }] : [],
    ),
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

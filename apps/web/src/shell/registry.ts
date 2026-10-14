import type { ObjectType } from '@ctws/contracts'
import { DeleteProject } from './projects/DeleteProject'
import { ProjectsCount, ProjectsStatus } from './projects/ProjectKind'
import { ProjectHead } from './projects/ProjectHead'
import type { ComponentType } from 'react'
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
import { peopleModule } from '../modules/people/index'
import { meetingModule } from '../modules/meetings/index'
import { readingModule } from '../modules/reading/index'
import { taskModule } from '../modules/tasks/index'

/**
 * WHICH MODULES THIS WORKSPACE HAS.
 *
 * A module-level constant, and that is load-bearing: the shell calls one hook per contribution
 * (a destination's count, a search provider, the capture target), so the list must never change
 * length or order at runtime or React would see a different hook order between renders. It is
 * frozen to say so out loud.
 */
export const MODULES: readonly WorkspaceModule[] = Object.freeze([
  taskModule,
  readingModule,
  peopleModule,
  meetingModule,
])

/**
 * Where a captured line goes by DEFAULT, named rather than inferred. With one module "the only
 * one" and "the default" look the same; they stop looking the same the day the notes module
 * registers a capture handler, and a default that silently depended on registration order would
 * change under it.
 */
export const CAPTURE_MODULE_ID = 'tasks'

/**
 * WHERE `/` GOES: the workbench, which is the shell's own page.
 *
 * NOT A MODULE'S PAGE, and not a default that silently depends on registration order: what the
 * front page shows is every module's glance side by side, which is a shell surface.
 */
export const WORKBENCH_PATH = '/'

/**
 * The shell's OWN chords. Projects and the workbench are shell concepts, so these are not a
 * module's to contribute -- they would survive every module being removed.
 */
const SHELL_CHORDS: Chord[] = [
  { id: 'workbench', key: 'w', label: 'Go to Workbench', resolve: () => WORKBENCH_PATH, order: 5 },
  { id: 'calendar', key: 'c', label: 'Go to Calendar', resolve: () => '/calendar', order: 18 },
  { id: 'projects', key: 'p', label: 'Go to Projects', resolve: () => '/projects', order: 20 },
]

/** The shell's own pages: they are about every kind at once, so no module owns them. */
export const SHELL_PAGES: readonly ModulePage[] = [
  { id: 'workbench', to: WORKBENCH_PATH, label: 'Workbench', end: true, chord: 'workbench' },
  { id: 'calendar', to: '/calendar', label: 'Calendar', chord: 'calendar' },
]

/**
 * THE RAIL'S TOP TIER, in reading order: the pages that cut across every kind, organised by time
 * and routine (home, the day, the month, the week), never by kind.
 *
 * At most five, which is where every surveyed system puts the always-visible tier. A new kind
 * never comes in here; it gets one row in Things. That rule is what keeps the rail from growing
 * with the software: the only part of it that grows is the project list, which is the person's own.
 *
 * Keys are `<module id or 'shell'>:<page id>`. A key whose module is not registered is skipped.
 */
export const PINNED = ['shell:workbench', 'tasks:today', 'shell:calendar', 'tasks:review'] as const

export type PinnedPage = ModulePage & { key: string }
export type RegisteredKind = KindEntry & { moduleId: string }
export type RegisteredChord = Chord & { moduleId: string | null }

export function pinnedPages(modules: readonly WorkspaceModule[] = MODULES): PinnedPage[] {
  const offered = new Map<string, ModulePage>([
    ...SHELL_PAGES.map((p) => [`shell:${p.id}`, p] as const),
    ...modules.flatMap((m) => (m.pages ?? []).map((p) => [`${m.id}:${p.id}`, p] as const)),
  ])
  return PINNED.flatMap((key) => {
    const page = offered.get(key)
    return page ? [{ ...page, key }] : []
  })
}

/**
 * EVERY KIND OF THING, one entry each, for Things. Projects is the shell's own kind and leads: it
 * is the kind the others cross at. Then the modules' kinds in their stated order.
 */
export function kinds(modules: readonly WorkspaceModule[] = MODULES): RegisteredKind[] {
  const own: RegisteredKind = {
    moduleId: '',
    label: 'Projects',
    to: '/projects',
    Count: ProjectsCount,
    Status: ProjectsStatus,
    chord: 'projects',
  }
  const theirs = modules
    .flatMap((m) => (m.kind ? [{ ...m.kind, moduleId: m.id }] : []))
    .sort((a, b) => (a.order ?? 50) - (b.order ?? 50))
  return [own, ...theirs]
}

/** Every module's pages, mounted under its own namespace. */
export function moduleRoutes(modules: readonly WorkspaceModule[] = MODULES): RouteObject[] {
  return modules.map((m) => ({ path: `/${m.id}`, children: m.routes }))
}

/**
 * The master key table: the shell's chords and every module's, in ONE list and ONE keyspace.
 * Ordered by `order` so the help overlay teaches the keys in a fixed order whatever the
 * registration order is.
 */
export function allChords(modules: readonly WorkspaceModule[] = MODULES): RegisteredChord[] {
  const contributed: RegisteredChord[] = [
    ...SHELL_CHORDS.map((c) => ({ ...c, moduleId: null })),
    ...modules.flatMap((m) => (m.chords ?? []).map((c) => ({ ...c, moduleId: m.id }))),
  ]
  return contributed.sort((a, b) => a.order - b.order)
}

/** The chord a second key names, or null if that key starts no jump. */
export function resolveChord(
  key: string,
  modules: readonly WorkspaceModule[] = MODULES,
): RegisteredChord | null {
  return allChords(modules).find((c) => c.key === key) ?? null
}

/**
 * The capture handler of the module named as the default. It throws rather than falling back,
 * because a silent fallback to "whichever module can capture" is exactly the implicit behaviour
 * this seam exists to remove.
 */
export function captureContribution(
  modules: readonly WorkspaceModule[] = MODULES,
  moduleId: string = CAPTURE_MODULE_ID,
): CaptureContribution {
  const chosen = modules.find((m) => m.id === moduleId)?.capture
  if (!chosen) throw new Error(`capture module "${moduleId}" is not registered`)
  return chosen
}

/**
 * Every module that can take a captured line, in registration order, with the DEFAULT named.
 *
 * The order is the registry's and never changes at runtime, which is what lets the capture box
 * call one hook per entry (`MODULES` is frozen for this reason). Routing is the caller's: it asks
 * each `accepts` in turn and falls back to the default, so "which module claimed it" stays a pure
 * decision made at the keyboard.
 */
export function captureContributions(modules: readonly WorkspaceModule[] = MODULES): {
  moduleId: string
  capture: CaptureContribution
}[] {
  return modules.flatMap((m) => (m.capture ? [{ moduleId: m.id, capture: m.capture }] : []))
}

export type SearchProvider = { moduleId: string; moduleLabel: string } & NonNullable<
  WorkspaceModule['search']
>

/** Every module that can be searched, in registration order. */
export function searchProviders(modules: readonly WorkspaceModule[] = MODULES): SearchProvider[] {
  return modules
    .filter((m) => m.search)
    .map((m) => ({ moduleId: m.id, moduleLabel: m.label, useHits: m.search!.useHits }))
}

/**
 * What a module hangs on a shell project page: its rows, and its numbers in the header banner.
 *
 * The project page asks the REGISTRY for these rather than importing the task module's tree, which
 * is the whole point of the seam: the page would otherwise be the shell knowing one module by
 * name, and the second module's rows could never appear on it.
 */
export type RegisteredProjectBlock = { moduleId: string; moduleLabel: string } & NonNullable<
  WorkspaceModule['projectBlock']
>

/**
 * Each module's block under a project, in registration order.
 *
 * The object page asks the REGISTRY for these rather than importing the task module's tree by
 * name, which is the whole point of the seam: the page would otherwise be the shell knowing one
 * module, and a second module's block could never appear on it.
 */
export function projectBlocks(
  modules: readonly WorkspaceModule[] = MODULES,
): RegisteredProjectBlock[] {
  return modules.flatMap((m) =>
    m.projectBlock ? [{ moduleId: m.id, moduleLabel: m.label, ...m.projectBlock }] : [],
  )
}

/** Each module's numbers in the project banner, in registration order. */
export function projectHeadlines(
  modules: readonly WorkspaceModule[] = MODULES,
): { moduleId: string; Component: ComponentType<{ projectId: string }> }[] {
  return modules.flatMap((m) =>
    m.ProjectHeadline ? [{ moduleId: m.id, Component: m.ProjectHeadline }] : [],
  )
}

export type CalendarProvider = { moduleId: string } & CalendarContribution

/** Every module that has dated things, in registration order. */
export function calendarProviders(
  modules: readonly WorkspaceModule[] = MODULES,
): CalendarProvider[] {
  return modules.flatMap((m) => (m.calendar ? [{ moduleId: m.id, ...m.calendar }] : []))
}

export type RegisteredWidget = Widget & { moduleId: string; moduleLabel: string }

/** Every module's workbench cards, in their stated order (registration order breaks a tie). */
export function moduleWidgets(modules: readonly WorkspaceModule[] = MODULES): RegisteredWidget[] {
  return modules
    .flatMap((m) => (m.widgets ?? []).map((w) => ({ ...w, moduleId: m.id, moduleLabel: m.label })))
    .sort((a, b) => (a.order ?? 50) - (b.order ?? 50))
}

export type RegisteredRelation = RelationContribution & { moduleId: string }

/**
 * WHO ANSWERS FOR EACH KIND OF THING at the far end of an edge, the shell's own included.
 *
 * The project entry is the SHELL's, like the project chord above: a project is one kind of object
 * now rather than the thing everything hangs off, but it is still not a module's.
 *
 * A type with no entry would make the backlink panel draw a group it cannot navigate, so
 * `relations.test.ts` asserts the set covers the contract exactly.
 */
const SHELL_RELATIONS: RelationContribution[] = [
  {
    type: 'project',
    kind: 'Project',
    to: (id) => `/projects/${id}`,
    Head: ProjectHead,
    Destroy: DeleteProject,
  },
]

export function relations(modules: readonly WorkspaceModule[] = MODULES): RegisteredRelation[] {
  return [
    ...SHELL_RELATIONS.map((r) => ({ ...r, moduleId: '' })),
    ...modules.flatMap((m) => (m.relations ?? []).map((r) => ({ ...r, moduleId: m.id }))),
  ]
}

/** Where one thing lives, or null when nothing answers for its type. */
export function relationFor(
  type: ObjectType,
  modules: readonly WorkspaceModule[] = MODULES,
): RegisteredRelation | null {
  return relations(modules).find((r) => r.type === type) ?? null
}

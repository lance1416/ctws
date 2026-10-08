import type { ObjectType } from '@ctws/contracts'
import type { ComponentType } from 'react'
import type { RouteObject } from 'react-router-dom'
import type {
  CalendarContribution,
  CaptureContribution,
  Chord,
  ChordContext,
  Destination,
  RelationContribution,
  Widget,
  WorkspaceModule,
} from './contract'
import { contactModule } from './contacts'
import { meetingModule } from './meetings'
import { readingModule } from './reading'
import { taskModule } from './tasks'

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
  contactModule,
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
 * It used to open a module's page, because the shell had nothing of its own to show and a default
 * that silently depended on registration order would have been worse. With two modules there IS
 * something to show -- each module's glance, side by side -- and that is a shell surface, so the
 * home path is no longer a module's to supply.
 */
export const WORKBENCH_PATH = '/'

/**
 * The shell's OWN chords. Projects and the workbench are shell concepts (contract §3), so these
 * are not a module's to contribute -- they would survive every module being removed.
 */
const SHELL_CHORDS: Chord[] = [
  { id: 'workbench', key: 'w', label: '去「工作台」', resolve: () => WORKBENCH_PATH, order: 5 },
  { id: 'calendar', key: 'c', label: '去「日程」', resolve: () => '/calendar', order: 18 },
  { id: 'projects', key: 'p', label: '去「项目」', resolve: () => '/projects', order: 20 },
]

/**
 * WHERE A DESTINATION SITS IN THE RAIL -- by what the person is trying to do, not by which module
 * owns it.
 *
 * Grouping by owner is what the rail did before, and it put 「今天」(one module's view) beside
 * 「待读」(a whole module) with nothing to tell them apart. Past five or six rows a flat list has
 * to be grouped, and the grouping that helps is the reader's: what is in front of me, what I keep,
 * what I look back at.
 */
export const RAIL_ZONES = ['now', 'kept', 'back'] as const
export type RailZone = (typeof RAIL_ZONES)[number]

export type RegisteredDestination = Destination & { moduleId: string }
export type RegisteredChord = Chord & { moduleId: string | null }

/** Every module's rail rows, in registration order. */
export function moduleDestinations(
  modules: readonly WorkspaceModule[] = MODULES,
): RegisteredDestination[] {
  return modules.flatMap((m) => m.destinations.map((d) => ({ ...d, moduleId: m.id })))
}

/**
 * The rail's rows, grouped and in reading order.
 *
 * The shell's own surfaces are in here too: 工作台 and 日程 answer 「现在」 as much as 今天 does,
 * and a rail that listed the modules' rows and then the shell's would be grouping by owner again.
 */
export function railGroups(
  modules: readonly WorkspaceModule[] = MODULES,
): { zone: RailZone; rows: RegisteredDestination[] }[] {
  const shell: RegisteredDestination[] = [
    {
      moduleId: '',
      id: 'workbench',
      to: WORKBENCH_PATH,
      label: '工作台',
      end: true,
      zone: 'now',
      order: 10,
    },
    { moduleId: '', id: 'calendar', to: '/calendar', label: '日程', zone: 'now', order: 30 },
  ]
  const all = [...shell, ...moduleDestinations(modules)]
  return RAIL_ZONES.map((zone) => ({
    zone,
    // 工作台, 今天, 日程: the shell's home leads, and the module's daily list sits between the two
    // shell surfaces, because that is the order they are reached in rather than the order the
    // modules happened to be registered in.
    rows: all
      .filter((d) => (d.zone ?? 'now') === zone)
      .sort((a, b) => (a.order ?? 50) - (b.order ?? 50)),
  })).filter((g) => g.rows.length > 0)
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
export type RegisteredProjectBlock<P extends { projectId: string } = { projectId: string }> = {
  moduleId: string
  moduleLabel: string
  Component: ComponentType<P>
  /** The block's views. Empty when the module declares none. */
  views: readonly { id: string; label: string }[]
}

const projectBlocks = <P extends { projectId: string }>(
  modules: readonly WorkspaceModule[],
  pick: (m: WorkspaceModule) => ComponentType<P> | undefined,
): RegisteredProjectBlock<P>[] =>
  modules.flatMap((m) => {
    const Component = pick(m)
    return Component
      ? [{ moduleId: m.id, moduleLabel: m.label, Component, views: m.views ?? [] }]
      : []
  })

/** Each module's rows under a shell project, in registration order. */
export function projectViews(
  modules: readonly WorkspaceModule[] = MODULES,
): RegisteredProjectBlock<{ projectId: string; view: string }>[] {
  return projectBlocks(modules, (m) => m.ProjectView)
}

/** Each module's block-header control, in registration order. */
export function projectViewActions(
  modules: readonly WorkspaceModule[] = MODULES,
): RegisteredProjectBlock[] {
  return projectBlocks(modules, (m) => m.ProjectViewAction)
}

export type CalendarProvider = { moduleId: string } & CalendarContribution

/** Every module that has dated things, in registration order. */
export function calendarProviders(
  modules: readonly WorkspaceModule[] = MODULES,
): CalendarProvider[] {
  return modules.flatMap((m) => (m.calendar ? [{ moduleId: m.id, ...m.calendar }] : []))
}

export type RegisteredWidget = Widget & { moduleId: string; moduleLabel: string }

/** Every module's workbench cards, in registration order. */
export function moduleWidgets(modules: readonly WorkspaceModule[] = MODULES): RegisteredWidget[] {
  return modules.flatMap((m) =>
    (m.widgets ?? []).map((w) => ({ ...w, moduleId: m.id, moduleLabel: m.label })),
  )
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
const SHELL_RELATIONS: RelationContribution[] = [{ type: 'project', to: (id) => `/projects/${id}` }]

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

/** Each module's numbers in the project header banner, in registration order. */
export function projectHeadlines(
  modules: readonly WorkspaceModule[] = MODULES,
): RegisteredProjectBlock[] {
  return projectBlocks(modules, (m) => m.ProjectHeadline)
}

export type { ChordContext }

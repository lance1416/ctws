import type { ComponentType } from 'react'
import type { RouteObject } from 'react-router-dom'
import type {
  CaptureContribution,
  Chord,
  ChordContext,
  Destination,
  WorkspaceModule,
} from './contract'
import { taskModule } from './tasks'

/**
 * WHICH MODULES THIS WORKSPACE HAS.
 *
 * A module-level constant, and that is load-bearing: the shell calls one hook per contribution
 * (a destination's count, a search provider, the capture target), so the list must never change
 * length or order at runtime or React would see a different hook order between renders. It is
 * frozen to say so out loud.
 */
export const MODULES: readonly WorkspaceModule[] = Object.freeze([taskModule])

/**
 * Where a captured line goes by DEFAULT, named rather than inferred. With one module "the only
 * one" and "the default" look the same; they stop looking the same the day the notes module
 * registers a capture handler, and a default that silently depended on registration order would
 * change under it.
 */
export const CAPTURE_MODULE_ID = 'tasks'

/** What `/` resolves to. The shell has no page of its own; it opens the module you work in. */
export const HOME_MODULE_ID = 'tasks'

/** The destination the home module opens on. */
export const HOME_DESTINATION_ID = 'today'

/**
 * The shell's OWN chords. Projects are a shell concept (contract §3), so `g p` is not the task
 * module's to contribute -- it would survive the task module being removed.
 */
const SHELL_CHORDS: Chord[] = [
  { id: 'projects', key: 'p', label: '去「项目」', resolve: () => '/projects', order: 20 },
]

export type RegisteredDestination = Destination & { moduleId: string }
export type RegisteredChord = Chord & { moduleId: string | null }

/** Every module's rail rows, in registration order. */
export function moduleDestinations(
  modules: readonly WorkspaceModule[] = MODULES,
): RegisteredDestination[] {
  return modules.flatMap((m) => m.destinations.map((d) => ({ ...d, moduleId: m.id })))
}

/** Every module's pages, mounted under its own namespace. */
export function moduleRoutes(modules: readonly WorkspaceModule[] = MODULES): RouteObject[] {
  return modules.map((m) => ({ path: `/${m.id}`, children: m.routes }))
}

/** Where `/` goes. */
export function homePath(
  modules: readonly WorkspaceModule[] = MODULES,
  moduleId: string = HOME_MODULE_ID,
  destinationId: string = HOME_DESTINATION_ID,
): string {
  const home = modules.find((m) => m.id === moduleId)
  const destination =
    home?.destinations.find((d) => d.id === destinationId) ?? home?.destinations[0]
  // Not a fallback to a literal: a workspace whose home module contributes no destination has a
  // registry bug, and sending the user to a path nobody registered would hide it.
  if (!destination) throw new Error(`home module "${moduleId}" contributes no destination`)
  return destination.to
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

/** Each module's numbers in the project header banner, in registration order. */
export function projectHeadlines(
  modules: readonly WorkspaceModule[] = MODULES,
): RegisteredProjectBlock[] {
  return projectBlocks(modules, (m) => m.ProjectHeadline)
}

export type { ChordContext }

import type { QueryClient } from '@tanstack/react-query'
import type { ComponentType, ReactNode } from 'react'
import type { RouteObject } from 'react-router-dom'

/**
 * WHAT A MODULE DECLARES.
 *
 * CTWS is a modular workspace and the task tracker is its first module, not its whole. This file
 * is the seam the second module will be built against -- and it is deliberately THIN. An
 * abstraction extracted from one example is the wrong abstraction (module-boundary contract §2),
 * so nothing here is designed for a module that does not exist yet: every field below exists
 * because something in the shell is hardwired to the task module today and had to stop being.
 *
 * Everything in this file is a DRAFT until a second real module has pushed back on it (§2,
 * stage C). Expect to change it; do not build a plugin framework on it.
 *
 * The shell owns: authentication and workspace isolation (including the tenant chokepoint), the
 * three-pane frame, the tokens and type scale, the focus model, overlays, the leave guard, the
 * generic pieces, projects, and the three CROSS-MODULE surfaces -- where capture goes, federated
 * search, and the master key table.
 *
 * A module owns: its own tables, its routes under `/api/v1/<id>/` and `/<id>/…`, its detail pane,
 * and what it contributes back to those shell surfaces.
 */
export type WorkspaceModule = {
  /**
   * The namespace: the module's SPA routes live under `/<id>/…` and its API routes under
   * `/api/v1/<id>/…`. Stable; it is in URLs the user may have bookmarked.
   */
  id: string
  /**
   * How the module names itself where a result has to say where it came from. Text, never a
   * colour (WCAG 1.4.1, the rule the whole redesign follows).
   */
  label: string
  /** Places in the left rail this module offers to go to, in the order the rail shows them. */
  destinations: Destination[]
  /** The module's own pages, mounted by the shell under `/<id>/`. Paths are RELATIVE. */
  routes: RouteObject[]
  /** Where a captured line lands, if this module can take one. */
  capture?: CaptureContribution
  /** This module's half of federated search. */
  search?: SearchContribution
  /** Keys this module adds to the shell's master key table. */
  chords?: Chord[]
  /**
   * What this module shows under a shell project. Projects are the SHELL's organising dimension
   * (contract §3): a module hangs its own rows on a project, it does not own the project page.
   */
  ProjectView?: ComponentType<{ projectId: string }>
  /**
   * What this module adds to the project page's HEADER BANNER: the numbers that say where this
   * line of work stands, in this module's terms.
   *
   * A component rather than a list of numbers, for the same reason `Destination.Count` is one: the
   * numbers come from the module's own query and the shell must not know which endpoint that is.
   * The shell owns the banner (projects are the shell's dimension, §3) and the generic pieces the
   * numbers are set in (`Stat`), so two modules' numbers sit in one banner instead of each
   * bringing its own layout.
   */
  ProjectHeadline?: ComponentType<{ projectId: string }>
}

/** A row in the left rail. */
export type Destination = {
  /** Unique within the module. */
  id: string
  /** Absolute path, inside the module's own namespace. */
  to: string
  label: string
  /** NavLink's exact match, for a path that is a prefix of another. */
  end?: boolean
  /**
   * The count beside the label. A COMPONENT rather than a number, because the count is the
   * module's own query and the rail must not know which one: it renders nothing when there is
   * nothing to say.
   */
  Count?: ComponentType
}

/**
 * Where a captured line goes. With one module this could stay implicit; with two it cannot
 * (contract §3), so the destination is named -- and the shell names ONE default explicitly rather
 * than falling through to whichever module happens to be registered. Capture stays a line and a
 * keystroke: resolving the target costs no interaction.
 */
export type CaptureContribution = {
  /** A hook: the module's default capture target, and why there is none when there is none. */
  useTarget: () => CaptureTargetState
}

export type CaptureTargetState = {
  /** null while unknown, or when this module cannot capture right now. */
  target: CaptureTarget | null
  /** The destination is genuinely absent -- a broken install, not a slow network. */
  missing: boolean
  /** The destination could not be loaded; retrying may work. */
  unavailable: boolean
}

export type CaptureTarget = {
  /** What to call the place the line landed in. */
  name: string
  /** Where "已放入 X" links to. */
  to: string
  /** Writes the line, and leaves the lists that now contain it refreshed. */
  submit: (title: string) => Promise<unknown>
}

/** A module's half of federated search. One provider per module; the shell merges them. */
export type SearchContribution = {
  /** A hook: this module's hits for `query`. An empty query means idle, not "match everything". */
  useHits: (query: string) => { hits: SearchHit[]; isError: boolean; isSuccess: boolean }
}

/**
 * One search result, in the pieces the dialog lays out. The module decides what its hit SAYS; the
 * shell decides where those pieces sit, so results from two modules line up in one list instead
 * of each bringing their own row design.
 */
export type SearchHit = {
  /** Unique across modules in practice (a uuid); also the row's test handle. */
  id: string
  /** Where choosing this hit goes. */
  to: string
  title: string
  /** The second line: a breadcrumb in the module's own wording. */
  meta: ReactNode
  /** The 24px marker at the head of the row. */
  mark: ReactNode
  /** The 3px identity rail at x=0, if the module has one. */
  rail?: ReactNode
}

/** A key in the shell's master table, read after the `g` prefix. */
export type Chord = {
  id: string
  /** The second key. One keyspace for the whole app: two modules cannot both claim `t`. */
  key: string
  /** The help overlay's wording. */
  label: string
  /**
   * Where this chord goes, or null when it cannot be resolved yet (a destination that is a row in
   * the database, not a route literal). NOT a hook: it runs on the keypress, so a chord costs no
   * query while nobody presses it.
   */
  resolve: (ctx: ChordContext) => string | null
  /**
   * The chord's place in the master table. The table is the shell's (contract §3) and the help
   * overlay teaches the keys in this order, so the order cannot be an accident of which module
   * was registered first.
   */
  order: number
}

export type ChordContext = { queryClient: QueryClient }

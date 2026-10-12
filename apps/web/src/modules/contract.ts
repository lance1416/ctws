import type { CalendarEntry, ObjectType } from '@ctws/contracts'
import type { QueryClient } from '@tanstack/react-query'
import type { ComponentType, ReactNode } from 'react'
import type { RouteObject } from 'react-router-dom'

/**
 * WHAT A MODULE DECLARES.
 *
 * The shell owns authentication and workspace isolation, the three-pane frame, the tokens and
 * type scale, the focus model, overlays, the leave guard, the generic pieces, projects, the edge
 * table, and the cross-module surfaces: capture, federated search and the key table.
 *
 * A module owns its own tables, its routes under `/api/v1/<id>/` and `/<id>/…`, its own body
 * inside the detail pane, and what it contributes back to those shell surfaces.
 */
export type WorkspaceModule = {
  /**
   * The namespace: the module's SPA routes live under `/<id>/…` and its API routes under
   * `/api/v1/<id>/…`. Stable; it is in URLs that may be bookmarked.
   */
  id: string
  /** How the module names itself where a result says where it came from. Text, never a colour. */
  label: string
  /** Places in the left rail this module offers to go to. */
  destinations: Destination[]
  /** The module's own pages, mounted by the shell under `/<id>/`. Paths are RELATIVE. */
  routes: RouteObject[]
  /** Where a captured line lands, if this module can take one. */
  capture?: CaptureContribution
  /** This module's half of federated search. */
  search?: SearchContribution
  /** Keys this module adds to the shell's key table. */
  chords?: Chord[]
  /**
   * WHAT THIS MODULE HANGS UNDER A PROJECT, if anything.
   *
   * Most modules hang nothing: their rows are edges, and the shell draws every kind of edge the
   * same way. A block is for rows that need an editor a list of links cannot be — the task tree
   * has drag, dependencies and an inline new row.
   */
  projectBlock?: {
    Component: ComponentType<{ projectId: string; view: string }>
    /**
     * The views the block offers, as tabs in its head. Fewer than two draws nothing.
     *
     * THE MODULE NAMES THEM, THE SHELL DRAWS THEM, so a third view costs no layout work. The
     * first entry is the default; the selected one is in the URL (`?view=<module>:<id>`), so a
     * reload and a shared link both land where the person was.
     */
    views?: readonly { id: string; label: string }[]
    /**
     * A control in the block's head, beside its name — its own "new", typically. Only the module
     * knows what making one of its things involves.
     */
    Action?: ComponentType<{ projectId: string }>
  }
  /**
   * This module's DATED THINGS, for the shell's calendar.
   *
   * The shell draws the grid and knows nothing about what each date MEANS: a module supplies
   * entries carrying their day and their own word for it. The day is decided by the server in
   * the account's zone — a client turning an instant into a day would put a 23:00 deadline on
   * the wrong square for half the world.
   */
  calendar?: CalendarContribution
  /**
   * This module's cards on the workbench.
   *
   * A glance in this module's terms, not a second copy of its page. The shell draws the card and
   * decides nothing about the contents.
   *
   * A WIDGET MUST NOT SHOW what already has a home on a project page: the workbench is for the
   * things belonging to no line of work, and two surfaces showing the same rows is two places to
   * keep in your head.
   */
  widgets?: readonly Widget[]
  /**
   * This module's numbers in the project banner.
   *
   * A component rather than a list of numbers: the numbers come from the module's own query and
   * the shell must not know which endpoint that is. The shell owns the banner and the pieces the
   * numbers are set in (`Stat`), so two modules' numbers sit in one banner.
   */
  ProjectHeadline?: ComponentType<{ projectId: string }>
  /**
   * HOW THIS MODULE'S THINGS ARE REACHED FROM SOMEBODY ELSE'S PAGE.
   *
   * The edge table and the backlink panel are the shell's: opening a person and seeing the
   * meetings they are in is one read of one table, and no module could own it without learning
   * about another. What the shell cannot know is where another module's thing lives.
   *
   * The API half is `links/linkable.ts`, where a module says what its things are CALLED. Routing
   * stays here, because a route is the web app's.
   */
  relations?: readonly RelationContribution[]
}

/** One object type this module answers for: where one lives, and what one looks like. */
export type RelationContribution = {
  /** The type as the contract names it. Exactly one module answers for each. */
  type: ObjectType
  /** ONE of them, named. The API supplies the plural for a group heading; this is the eyebrow. */
  kind: string
  /** Where one of these lives. */
  to: (id: string) => string
  /**
   * THE OBJECT'S OWN FIELDS, at the head of its page.
   *
   * The page is the shell's — a project, a person and a meeting are read the same way — but what
   * a person IS is the people module's to say. The shell draws the frame and what the object is
   * connected to; this fills the top.
   *
   * A type with no `Head` has no page of its own, and the shell routes to its module's list.
   */
  Head?: ComponentType<{ id: string }>
  /**
   * HOW ONE OF THESE IS DESTROYED, for the shell's `DangerZone` at the foot of the page.
   *
   * The shell decides WHERE a destructive action goes, because "last, under a rule, in red" has
   * to be the same answer for every kind of thing or the reader has to learn it twice. What it
   * cannot know is what destroying one MEANS -- a project takes its tasks, a repeating meeting
   * asks which occurrences -- so the module draws the control and the shell draws the frame.
   *
   * Absent for a type with nothing to destroy from a page of its own.
   */
  Destroy?: ComponentType<{ id: string }>
}

/** A module's half of the calendar. One provider per module; the shell merges them. */
export type CalendarContribution = {
  /** How this module's entries are named in the grid's view tabs. */
  label: string
  /** A hook: this module's entries for an inclusive day range. */
  useEntries: (range: { from: string; to: string }) => {
    entries: CalendarEntry[]
    isError: boolean
  }
  /**
   * WHAT OPENS when one of this module's entries is clicked on the grid.
   *
   * Without it an entry is a link to wherever `to` points, which is right for a deadline: it
   * belongs to a task, and the task's own list is where you deal with it. A meeting has nowhere
   * else to be, so it opens here.
   */
  Detail?: ComponentType<{ id: string; onClose: () => void }>
}

/** One card on the workbench. */
export type Widget = {
  /** Unique within the module. Also the card's test handle. */
  id: string
  /** The card's heading. */
  label: string
  /** Where “See all” goes, when there is more than the card shows. */
  to?: string
  /** The card's contents. The shell gives it no props: a widget is about the workspace, not a row. */
  Component: ComponentType
}

/** A row in the left rail. */
export type Destination = {
  /** Unique within the module. */
  id: string
  /**
   * WHICH GROUP OF THE RAIL this row belongs in, by what the person is trying to do:
   *
   * - `now` (the default): what is in front of me today.
   * - `things`: a KIND of object, listed. Each is where one of that kind is made.
   * - `views`: a way of looking ACROSS the kinds. A view owns nothing and makes nothing.
   *
   * The module declares it because only the module knows what its page is FOR; the shell draws
   * the groups.
   */
  zone?: 'now' | 'things' | 'views'
  /**
   * The row's place within its zone. Explicit, so the reading order is an editorial decision
   * rather than an accident of which module was registered first.
   */
  order?: number
  /** Absolute path, inside the module's own namespace. */
  to: string
  label: string
  /** NavLink's exact match, for a path that is a prefix of another. */
  end?: boolean
  /**
   * The count beside the label. A COMPONENT rather than a number, because the count is the
   * module's own query and the rail must not know which one. It renders nothing when there is
   * nothing to say.
   */
  Count?: ComponentType
}

/**
 * Where a captured line goes. The shell names one default explicitly rather than falling through
 * to whichever module happens to be registered. Capture stays a line and a keystroke: resolving
 * the target costs no interaction.
 */
export type CaptureContribution = {
  /** A hook: the module's default capture target, and why there is none when there is none. */
  useTarget: () => CaptureTargetState
  /**
   * Does this module claim the line? Asked in registration order; the first claimer takes it, and
   * when nobody claims it the line goes to `CAPTURE_MODULE_ID`.
   *
   * NOT A HOOK, and deliberately pure: it runs on every keystroke, and a rule needing a query
   * could not answer before Enter is pressed. A wrong guess is visible, because the confirmation
   * names where the line went.
   */
  accepts?: (line: string) => boolean
}

export type CaptureTargetState = {
  /** null while unknown, or when this module cannot capture right now. */
  target: CaptureTarget | null
  /** The destination is genuinely absent — a broken install, not a slow network. */
  missing: boolean
  /** The destination could not be loaded; retrying may work. */
  unavailable: boolean
}

export type CaptureTarget = {
  /** What to call the place the line landed in. */
  name: string
  /** Where the confirmation links to. */
  to: string
  /** Writes the line, and leaves the lists that now contain it refreshed. */
  submit: (title: string) => Promise<unknown>
}

/** A module's half of federated search. One provider per module; the shell merges them. */
type SearchContribution = {
  /** A hook: this module's hits for `query`. An empty query means idle, not "match everything". */
  useHits: (query: string) => { hits: SearchHit[]; isError: boolean; isSuccess: boolean }
}

/**
 * One search result, in the pieces the dialog lays out. The module decides what its hit SAYS; the
 * shell decides where those pieces sit, so results from two modules line up in one list.
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

/** A key in the shell's key table, read after the `g` prefix. */
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
   * The chord's place in the key table, which the help overlay teaches in this order. Explicit,
   * so the order is not an accident of which module was registered first.
   */
  order: number
}

type ChordContext = { queryClient: QueryClient }

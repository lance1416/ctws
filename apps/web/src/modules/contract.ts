import type { CalendarEntry, ObjectType } from '@ctws/contracts'
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
  ProjectView?: ComponentType<{ projectId: string; view: string }>
  /**
   * The views this module's block offers, as tabs in the block's head. One entry means no tabs
   * are drawn: a tab bar with a single tab is chrome that decides nothing.
   *
   * THE MODULE NAMES THEM, THE SHELL DRAWS THEM. A board is not a second page and not a second
   * destination in the rail -- it is another way to look at the same block, the way Notion's
   * databases and Linear's issue lists carry their views. That is also what keeps a third view
   * (and a second module's views) from costing any layout work.
   *
   * The first entry is the default. The selected one is in the URL (`?view=<module>:<id>`), so a
   * reload and a shared link both land where the person was.
   */
  views?: readonly { id: string; label: string }[]
  /**
   * A control in the HEAD of this module's block, beside its name -- the block's own "new",
   * typically.
   *
   * A block header is 「名字 · 计数 · 本块的动作」, and the action belongs to the module because
   * only the module knows what making one of its things involves. The shell draws the header and
   * decides nothing about what is in this slot.
   */
  ProjectViewAction?: ComponentType<{ projectId: string }>
  /**
   * This module's DATED THINGS, for the shell's calendar.
   *
   * The shell draws the grid and knows nothing about what a 截止 is or how it differs from
   * 想读完: the module supplies entries that already carry their day and their own word for what
   * the date means. The day is decided by the SERVER in the account's zone, like every other date
   * in this app -- a client turning an instant into a day would put a 23:00 deadline on the wrong
   * square for half the world.
   *
   * This is the fifth contribution point and the first designed with two modules in front of it,
   * which is why it exists at all: a seam shaped by one module is that module's shape wearing a
   * general name (contract §2).
   */
  calendar?: CalendarContribution
  /**
   * This module's cards on the WORKBENCH -- the shell's own front page.
   *
   * A widget answers 「现在手头有什么」 in this module's terms and nothing else: it is a glance,
   * not a second copy of the module's page. The shell draws the card (its name, its link, the
   * grid it sits in) and decides nothing about the contents, exactly as it does for a project
   * block.
   *
   * WHAT A WIDGET MUST NOT SHOW is anything that already has a home on the project page. The
   * workbench is where the things that belong to no line of work live; the project pages are
   * where the rest do. Two surfaces showing the same rows is two places to keep in your head.
   */
  widgets?: readonly Widget[]
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
  /**
   * HOW THIS MODULE'S THINGS ARE REACHED FROM SOMEBODY ELSE'S PAGE.
   *
   * The edge table is the shell's, and so is the backlink panel: opening a person and seeing the
   * meetings they are in is one read of one table, and no module could own it without learning
   * about another. What the shell cannot know is where one of ANOTHER module's things lives, so
   * the module says.
   *
   * The API half of this is `links/linkable.ts`, where a module says what its things are CALLED.
   * Routing stays here, because a route is the web app's and the server has no business holding
   * one.
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
   * The page is the SHELL's -- a project, a person and a meeting are read the same way, so they
   * are one page and not three (framing §2) -- but what a person IS is the contacts module's to
   * say. The shell draws the frame and what the object is connected to; this fills the top.
   *
   * A type with no `Head` has no page of its own, and the shell routes to its module's list.
   */
  Head?: ComponentType<{ id: string }>
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
   * WHAT OPENS when one of this module's entries is clicked ON THE GRID.
   *
   * Without it an entry is a link to wherever `to` points, which is right for a deadline -- it
   * belongs to a task, and the task's own list is where you deal with it. A meeting has nowhere
   * else to be, so it opens here. The shell knows which module an entry came from, because it
   * merged them, so nothing has to be encoded in the entry itself.
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
   * - `things`: a KIND of object, listed -- meetings, people, the reading pile. Each is where one
   *   of that kind is made, because the making belongs with the kind.
   * - `views`: a way of looking ACROSS the kinds -- the calendar, the week in review. A view owns
   *   nothing and makes nothing (framing §2).
   *
   * The module declares it because only the module knows what its page is FOR; the shell draws
   * the groups. Grouping by which module owns a row is what the rail did before, and it is the
   * reason “Today” (one module's view) sat beside “Reading” (a whole module) as if they were peers.
   */
  zone?: 'now' | 'things' | 'views'
  /**
   * The row's place WITHIN its zone. Explicit, because the reading order is an editorial decision
   * and letting it fall out of registration order would make it an accident of which module was
   * added first -- the calendar landed above Today exactly that way.
   */
  order?: number
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
  /**
   * Does this module claim the line? Asked in registration order; the first claimer takes it, and
   * when nobody claims it the line goes to `CAPTURE_MODULE_ID`.
   *
   * NOT A HOOK, and deliberately pure: it runs on every keystroke, and a rule that needed a
   * query could not answer before the person pressed Enter. It is also the reason capture can
   * stay 「敲一行字就走」 with two modules registered -- resolving the destination costs no
   * interaction, and when the guess is wrong you can SEE it, because 「已放入 X」 names where the
   * line went.
   */
  accepts?: (line: string) => boolean
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
type SearchContribution = {
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

type ChordContext = { queryClient: QueryClient }

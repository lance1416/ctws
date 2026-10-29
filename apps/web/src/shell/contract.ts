import {
  type CalendarEntry,
  type LinkCandidate,
  type ObjectType,
  type ProjectResponse,
  type PersonId,
  type ProjectId,
} from '@ctws/contracts'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { ComponentType, ReactNode } from 'react'
import type { RouteObject } from 'react-router-dom'
import type { KeyTable } from '../platform/keyboard/keyTable'
import type { IconComponent } from '../platform/ui/icons'

/**
 * What a module declares. The shell owns auth, the frame, overlays, projects, the edge table and
 * the cross-module surfaces; a module owns its tables, its routes and what it adds to those.
 */
export type WorkspaceModule = {
  /** The namespace for `/<id>/…` and `/api/v1/<id>/…`. Stable: it is in bookmarked URLs. */
  id: string
  /** How the module names itself where a result says where it came from. Text, never a colour. */
  label: string
  /** Pages offered for the top of the rail; the app's `pinned` config picks which are shown. */
  pages?: readonly ModulePage[]
  /** The kind's one entry in Things. A module never adds rows to the rail; more pages are tabs. */
  kind?: KindEntry
  /** Mounted by the shell under `/<id>/`, so the paths are relative. */
  routes: RouteObject[]
  /** Pages across kinds this module defines (Today, Review), mounted at the root (FR-019). */
  places?: RouteObject[]
  capture?: CaptureContribution
  chords?: Chord[]
  /** What this module can make from anywhere: `N` then the creator's key, and the New menu. */
  creates?: readonly Creator[]
  project?: ProjectContribution
  /** What this module adds to a person's page (FR-061). */
  person?: PersonContribution
  /**
   * The module's key tables, in its order: the keyboard help shows them, the switch there silences
   * their single keys, and the components that answer them bind their actions from them.
   */
  keys?: readonly KeyTable[]
  /**
   * Dated things for the shell's calendar. The server decides each entry's day in the account's
   * zone; a client turning an instant into a day would put a 23:00 deadline on the wrong square.
   */
  calendar?: CalendarContribution
  /** What it shows on the workbench, each in its place there (FR-076). */
  widgets?: readonly Widget[]
  /**
   * Blocks in Today's right column (FR-079): what to answer, start or remember today. Ordered
   * across modules by `order`: Follow up, Ready to start, This week, Birthdays.
   */
  today?: readonly TodayBlock[]
  /** Where this module's things live, for the shell's edge table and backlinks. */
  relations?: readonly RelationContribution[]
  /** Full lists a block's "All N" opens in the inspector (FR-011, FR-015). */
  lists?: readonly InspectorList[]
  /** What it counts of a week, for the review (FR-081). */
  weekCounts?: readonly WeekCount[]
  /**
   * What the module's queries show, by key prefix: a write that changes one of those kinds of
   * thing refreshes them, and no write that changes none of them does.
   */
  reads: readonly Reads[]
}

/** Queries under one key prefix, and every kind of thing whose change can alter their answer. */
export type Reads = { queryKey: QueryKey; of: readonly ObjectType[] }

/** What a module adds to a project. Components, so the shell never knows the module's endpoints. */
export type ProjectContribution = {
  /**
   * The rows a project's page is about, like the task tree, and the views its head switches
   * between (FR-053), the first the default. At most one module gives them.
   */
  Main?: {
    Component: ComponentType<{ projectId: ProjectId; view: string }>
    views: readonly [ProjectView, ...ProjectView[]]
  }
  /**
   * This module's own things in a project, for their block on its page (FR-055): the meetings
   * coming up, the people on it, its reading. The shell puts them with what is linked to the
   * project by hand, and the block's + makes a new one in the project.
   */
  Things?: {
    kind: ObjectType
    /** A hook: called once per page, in registry order. */
    useThings: (projectId: ProjectId) => OwnThings
  }
  /**
   * A project's card on the overview (FR-051, artboard 18), at most one module's: `Moved` beside
   * its name, `Facts` under it, and `useOrder`, a hook called once a page, the cards' order.
   */
  Card?: {
    Moved: ComponentType<{ project: ProjectResponse }>
    Facts: ComponentType<{ project: ProjectResponse }>
    useOrder: () => (a: ProjectResponse, b: ProjectResponse) => number
  }
  /**
   * The open project's outline under its row in the sidebar (FR-021, artboard 8): what to jump
   * to on its page. At most one module gives one.
   */
  Outline?: ComponentType<{ projectId: ProjectId }>
  /**
   * The project's rows as its narrow page in the inspector has them (artboard 33): the top level
   * only, and a way to the whole tree. At most one module gives them.
   */
  Narrow?: ComponentType<{ projectId: ProjectId }>
  /**
   * How many of this module's things wait in a project, beside its name in the rail. At most one
   * module gives one; zero is shown as nothing.
   */
  count?: (project: ProjectResponse) => number
  /** The kinds of thing whose numbers the server adds to each project's `columns` for this module. */
  counts?: readonly ObjectType[]
  /** What deleting a project takes with it, as a phrase ("12 tasks"), or null for nothing. */
  contents?: (qc: QueryClient, projectId: ProjectId) => Promise<string | null>
}

type ProjectView = {
  id: string
  label: string
  icon?: IconComponent
  /** It takes the page's full width, and the project's blocks go under it (the board). */
  wide?: boolean
}

export type PersonContribution = {
  /**
   * This module's own things with a person, for their block on the person's page: the meetings
   * they are in, the reading they recommended. The shell puts them with what is linked by hand.
   */
  Things?: {
    kind: ObjectType
    /** A hook: called once per page, in registry order. */
    useThings: (personId: PersonId) => OwnThings
  }
  /**
   * How a linked thing of this module's kind is drawn on a person's page (artboard 5): a task
   * with its status and when it is due, not the sentence that linked it; and its block's count in
   * the module's words ("3 open").
   */
  Linked?: {
    kind: ObjectType
    Row: ComponentType<{ thing: LinkCandidate }>
    count?: (things: readonly LinkCandidate[]) => ReactNode
  }
}

/** One of a module's things in a project, as its block lists it. */
type OwnThing = {
  id: string
  title: string
  /** Where it opens, when not the kind's own address (a meeting's next occurrence). */
  to?: string
  /** A word or two in the row's first column: "Thu 14:00". */
  lead?: string | null
  /** Its `lead` is a time still to come: a narrow page says it in the kind's colour (I-06). */
  upcoming?: boolean
  /** A person's initials: their avatar stands in the first column instead (FR-049). */
  initials?: string | null
  /** Who it is with, an avatar after the lead's words (a message: its day, then them; U-12). */
  withInitials?: string | null
  /** A word or two at the row's end. */
  fact?: string | null
  /** A second line under the title: a meeting's place, a book's author (artboard 5). */
  sub?: ReactNode
  /** What the row ends with instead of `fact`: a duration and a project, a status. */
  trail?: ReactNode
}

export type OwnThings = {
  things: OwnThing[]
  isPending: boolean
  isError: boolean
  retry: () => void
  /**
   * Things that join a project rather than being made in it (FR-055): the block's + finds one to
   * `add`, or `make`s one under the name typed; each row can `remove` it from the project.
   */
  join?: Join
}

export type Join = {
  add: (id: string) => void
  remove: (id: string) => void
  make: (name: string) => void
  busy: boolean
  /** Why the last add or remove did not take. */
  error: string | null
}

export type RelationContribution = {
  /** Exactly one module answers for each type. */
  type: ObjectType
  /** One of them, named, for the eyebrow. */
  kind: string
  /** Several of them: the heading where they are listed together. */
  plural: string
  to: (id: string) => string
  /** Where search takes one, when not to `to`: a task to its row in its project's tree. */
  found?: (thing: LinkCandidate) => string
  /**
   * The row's first column where things of every kind are listed (DES-001 section 4): a status, an
   * avatar. Without it the kind's icon on its tint stands there.
   */
  Mark?: ComponentType<{ thing: LinkCandidate }>
  /** The one fact in the third column, from what the kind carries; nothing when there is none. */
  Fact?: ComponentType<{ thing: LinkCandidate }>
  /**
   * A change this kind logged, as a line of its timeline (FR-045): a mark and words, or null for
   * a change not worth a line of its own.
   */
  describeChange?: (
    event: { type: string; payload: unknown },
    timeZone: string,
  ) => ChangeLine | null
  /**
   * Finishing one, for a kind that can be finished: "Mark done" on coming back from a resource
   * opened from it (FR-028).
   */
  finish?: (id: string) => Promise<unknown>
  /**
   * Its narrow page in the inspector (FR-022, artboard 33): the full page's blocks, in its order,
   * in one column, 400 wide. Without it the inspector offers only the full page.
   */
  Narrow?: ComponentType<{ id: string; at?: string | undefined }>
  /** Its edit page, for the inspector's Edit; none where it is edited in place (a task). */
  edit?: (id: string, at?: string) => string
  /** Its narrow page has a head of its own (a task's pane, artboard 8); the inspector's goes. */
  ownHead?: boolean
}

/** One change on a timeline, in its module's words. */
export type ChangeLine = { mark: ReactNode; text: ReactNode }

/** A calendar entry with its times said on the account's clock, as every reader of one draws it. */
export type SaidEntry = CalendarEntry & {
  /** The time of day in the account's zone, for a thing that has one; squares sort by it. */
  time: string | null
  /** When it ends on the same clock, for a thing that lasts. */
  endTime: string | null
  /** The zone it was agreed in ("EDT"), when that is not the account's. */
  zone: string | null
  /** Its time on that zone's clock, when the zone is not the account's. */
  zoneTime: string | null
}

/** A calendar entry as the shell draws it: said, with its module's route and words. */
export type ShownEntry = SaidEntry & {
  /** Unique among the entries of one window: a task is planned and due, a series recurs. */
  key: string
  /** Where clicking it goes, inside the app. */
  to: string
  /** What the date is, in words: "planned", "Birthday". */
  label: string
}

/** One block in Today's right column, given the account's today. */
export type TodayBlock = { id: string; order: number; Block: ComponentType<{ today: string }> }

/** A module's half of the calendar; the shell merges them. */
export type CalendarContribution = {
  /** The name in the grid's view tabs. */
  label: string
  /** A hook: this module's entries for an inclusive day range. */
  useEntries: (range: { from: string; to: string }) => {
    entries: CalendarEntry[]
    isError: boolean
    /** Reads them again, after a failure. */
    retry: () => void
  }
  /**
   * Where an entry goes and the words for its date, and its title when the module words it: the
   * server says only what and which it is.
   */
  show: (entry: SaidEntry) => { to: string; label: string; title?: string }
  /**
   * What opens over the grid when an entry is clicked: the address parameters that name it, and
   * the pane that reads them back. Without it the entry links to its `to`.
   */
  opens?: {
    params: (entry: CalendarEntry) => Record<string, string>
    Pane: ComponentType
  }
}

/**
 * The places on the workbench a module fills (FR-076). The shell owns the arrangement (FR-078),
 * the launcher, the next seven days and the widgets not built yet.
 */
export type WorkbenchPlace = 'now' | 'meetings' | 'awaiting' | 'birthdays' | 'reading'

export type Widget = {
  /** At most one module fills each place. */
  place: WorkbenchPlace
  /** Takes no props: a widget is about the workspace. It draws its own block, filling its place. */
  Component: ComponentType
}

export type ModulePage = {
  /** Unique within the module; `pinned` names it as `<module id>:<page id>`. */
  id: string
  /** Absolute, inside the module's own namespace. */
  to: string
  label: string
  /** NavLink's exact match, for a path that is a prefix of another. */
  end?: boolean
  /** The id of the chord that goes here, so search can show its key. */
  chord?: string
  /** The count beside the label. A component, so the rail never knows the module's query. */
  Count?: ComponentType
  /** The glyph over the label where a phone shows the page as a tab: paths in a 22px box. */
  icon?: ReactNode
  /**
   * A list of its own in the sidebar's place, for a page across kinds that has one: Review's
   * weeks (FR-081). `label` heads it.
   */
  Sidebar?: { label: string; List: ComponentType }
}

/**
 * One thing a module counts of a week for the review's "Also this week" (FR-081): the name the
 * server counts it by, its words and its icon, and where it goes among the others.
 */
export type WeekCount = { key: string; label: string; icon: IconComponent; order: number }

/** A kind of thing, as Things lists it. */
export type KindEntry = {
  /** Plural: "People", "Meetings". */
  label: string
  to: string
  /** How many there are, a bare number for the sidebar's head (FR-021), zero included. */
  Count?: ComponentType
  /** The module's list in its sidebar, under the head (FR-020). */
  List?: ComponentType
  /** One line of what is current ("Next birthday: …"); renders nothing when there is nothing. */
  Status?: ComponentType
  /** The id of the chord that goes here, so Things can show its key. */
  chord?: string
  /** An editorial order, not registration order. */
  order?: number
}

export type CaptureContribution = {
  /** Which kind the box makes when this module takes the line (FR-025's Task and Reading). */
  kind: 'task' | 'reading'
  /** A hook: the module's default capture target, and why there is none when there is none. */
  useTarget: () => CaptureTargetState
  /**
   * Whether this module claims the line; the first claimer in registration order takes it, else
   * the configured `captureModuleId`. Pure rather than a hook: it runs on every keystroke.
   */
  accepts?: (line: string) => boolean
}

export type CaptureTargetState = {
  /** null while unknown, or when this module cannot capture right now. */
  target: CaptureTarget | null
  /** The destination is genuinely absent, a broken install rather than a slow network: what to say. */
  missing?: string | null
  /** The destination could not be loaded and retrying may work: what to say. */
  unavailable?: string | null
}

export type CaptureTarget = {
  /** What to call the place the line lands in when no project is picked ("Inbox", "To read"). */
  name: string
  /** Where the confirmation links to then. */
  to: string
  /**
   * Writes the line into the project picked, or the default place, on the day picked if any; and
   * starts refreshing the lists that now contain it without waiting. Answers where the made thing
   * opens, for a New made from search, which opens it (FR-026); the capture box stays put.
   */
  submit: (title: string, where: CaptureWhere) => Promise<string>
}

/** What the box lets the person choose beside the line (FR-025). */
type CaptureWhere = { projectId: ProjectId | null; date: string | null }

/** One search result. The module decides what it says; the shell lays it out so modules line up. */
export type SearchHit = {
  /** A uuid in practice, so unique across modules; also the row's test handle. */
  id: string
  /** Which kind it is: the tab it sits under, and what the inspector opens (FR-024). */
  type: ObjectType
  to: string
  title: string
  /** The column after the title: where it belongs, or when it is, in the module's own wording. */
  meta: ReactNode
  /** The 24px marker at the head of the row. */
  mark: ReactNode
}

/**
 * ONE WAY TO MAKE A THING (FR-026): `N` then `key` anywhere, and a row of the New menu. Either a
 * dialog the shell mounts, given the project the page is on, or a page to go to.
 */
export type Creator = {
  kind: ObjectType
  /** The second key after `N`. One keyspace across the app. */
  key: string
  /** "Task", "Meeting": the menu's word. */
  label: string
  Dialog?: ComponentType<{
    projectId: ProjectId | null
    /**
     * The thing whose page it was made from, which it is made with where its kind can be: a
     * meeting from a person's page has them attending (FR-061).
     */
    about: { type: ObjectType; id: string; title: string } | null
    onClose: () => void
    /**
     * Open the made thing's page once it is made: it was made from its module's own sidebar or
     * page (FR-026). Otherwise the page it was made from stays, and its block shows it.
     */
    opens: boolean
    /** The day it is for, made from a day on the calendar (FR-080): a task planned, a meeting held. */
    day: string | null
  }>
  /** Where to go instead, when the kind is made on its own page; given the page it is made from. */
  to?: string | ((about: { type: ObjectType; id: string; title: string } | null) => string)
}

/** A key in the shell's key table, read after the `g` prefix. */
export type Chord = {
  id: string
  /** The second key. One keyspace for the whole app: two modules cannot both claim `t`. */
  key: string
  /** The help overlay's wording. */
  label: string
  /** The chord this replaced in the redesign (FR-029), shown in the help for one release. */
  was?: string
  /**
   * Where this chord goes, or null when that cannot be resolved yet. Not a hook: it runs on the
   * keypress, so a chord costs no query while nobody presses it.
   */
  resolve: (ctx: ChordContext) => string | null
  /** The order the help overlay teaches; explicit, so it does not follow registration order. */
  order: number
}

type ChordContext = { queryClient: QueryClient }

/**
 * A full list in the inspector (FR-011 rule 3, FR-015): the rest of a block that shows five,
 * opened by its "All N" beside the page, which stays put. Named in the address as
 * `?inspect=list:<name>`, or `list:<name>.<arg>` for one that needs to know whose it is.
 */
export type InspectorList = {
  name: string
  /** The inspector's eyebrow while it is open: where the list is from ("Today"). */
  label: string
  icon: IconComponent
  Body: ComponentType<{ arg: string }>
}

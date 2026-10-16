import {
  type CalendarEntry,
  type ObjectType,
  type ProjectListItem,
  type ProjectId,
} from '@ctws/contracts'
import type { QueryClient } from '@tanstack/react-query'
import type { ComponentType, ReactNode } from 'react'
import type { RouteObject } from 'react-router-dom'
import type { KeyTable } from '../platform/keyboard/keyTable'

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
  capture?: CaptureContribution
  search?: SearchContribution
  chords?: Chord[]
  project?: ProjectContribution
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
  /** Cards on the workbench. A card must not show rows that already live on a project page. */
  widgets?: readonly Widget[]
  /** Where this module's things live, for the shell's edge table and backlinks. */
  relations?: readonly RelationContribution[]
}

/** What a module adds to a project. Components, so the shell never knows the module's endpoints. */
export type ProjectContribution = {
  /** Rows on the project's page that need more than a list of edges, like the task tree. */
  Block?: {
    Component: ComponentType<{ projectId: ProjectId; view: string }>
    /** The block's views, the first the default; tabs in its head are drawn from two up. */
    views: readonly [BlockView, ...BlockView[]]
    /** A control in the block's head, typically its own "new". */
    Action?: ComponentType<{ projectId: ProjectId }>
  }
  /** Numbers under the project's name on its page, said as a sentence. */
  Headline?: ComponentType<{ projectId: ProjectId }>
  /** Numbers for a project's row in the list, said as one line. */
  RowFacts?: ComponentType<{ project: ProjectListItem }>
  /** Numbers for a project's Workbench card, a line each. */
  TileFacts?: ComponentType<{ project: ProjectListItem }>
  /** The day in the margin of a project's row in the list. At most one module gives one. */
  Lead?: ComponentType<{ projectId: ProjectId }>
  /**
   * How many of this module's things wait in a project, beside its name in the rail. At most one
   * module gives one; zero is shown as nothing.
   */
  count?: (project: ProjectListItem) => number
  /** What deleting a project takes with it, as a phrase ("12 tasks"), or null for nothing. */
  contents?: (qc: QueryClient, projectId: ProjectId) => Promise<string | null>
}

type BlockView = { id: string; label: string }

export type RelationContribution = {
  /** Exactly one module answers for each type. */
  type: ObjectType
  /** One of them, named, for the eyebrow; the API supplies the plural. */
  kind: string
  to: (id: string) => string
}

/** A calendar entry as the shell draws it: the server's, with its module's route and words. */
export type ShownEntry = CalendarEntry & {
  /** Unique among the entries of one window: a task is planned and due, a series recurs. */
  key: string
  /** Where clicking it goes, inside the app. */
  to: string
  /** What the date is, in words: "planned", "Birthday". */
  label: string
}

/** A module's half of the calendar; the shell merges them. */
export type CalendarContribution = {
  /** The name in the grid's view tabs. */
  label: string
  /** A hook: this module's entries for an inclusive day range. */
  useEntries: (range: { from: string; to: string }) => {
    entries: CalendarEntry[]
    isError: boolean
  }
  /** Where an entry goes and the words for its date: the server says only what and which it is. */
  show: (entry: CalendarEntry) => { to: string; label: string }
  /**
   * What opens over the grid when an entry is clicked: the address parameters that name it, and
   * the pane that reads them back. Without it the entry links to its `to`.
   */
  opens?: {
    params: (entry: CalendarEntry) => Record<string, string>
    Pane: ComponentType
  }
}

export type Widget = {
  /** Unique within the module; also the card's test handle. */
  id: string
  label: string
  /** The heading links here, so there is no separate "See all". */
  to?: string
  /** Takes no props: a widget is about the workspace, not a row. */
  Component: ComponentType
  /** A short note at the end of the heading row: the date, "2 today", "5 to read". */
  Aside?: ComponentType
  /** An editorial order, not registration order. */
  order?: number
  /** How many of the Workbench's twelve columns it takes from 1024px up. */
  span: 4 | 6 | 8
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
}

/** A kind of thing, as Things lists it. */
export type KindEntry = {
  /** Plural: "People", "Meetings". */
  label: string
  to: string
  /** The count in the kind's own words ("5 to read"), zero included. */
  Count?: ComponentType
  /** One line of what is current ("Next birthday: …"); renders nothing when there is nothing. */
  Status?: ComponentType
  /** The id of the chord that goes here, so Things can show its key. */
  chord?: string
  /** An editorial order, not registration order. */
  order?: number
}

export type CaptureContribution = {
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
  /** What to call the place the line landed in. */
  name: string
  /** Where the confirmation links to. */
  to: string
  /** Writes the line, and starts refreshing the lists that now contain it without waiting. */
  submit: (title: string) => Promise<unknown>
}

type SearchContribution = {
  /** A hook: this module's hits for `query`. An empty query means idle, not "match everything". */
  useHits: (query: string) => { hits: SearchHit[]; isError: boolean; isSuccess: boolean }
}

/** One search result. The module decides what it says; the shell lays it out so modules line up. */
export type SearchHit = {
  /** A uuid in practice, so unique across modules; also the row's test handle. */
  id: string
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
   * Where this chord goes, or null when that cannot be resolved yet. Not a hook: it runs on the
   * keypress, so a chord costs no query while nobody presses it.
   */
  resolve: (ctx: ChordContext) => string | null
  /** The order the help overlay teaches; explicit, so it does not follow registration order. */
  order: number
}

type ChordContext = { queryClient: QueryClient }

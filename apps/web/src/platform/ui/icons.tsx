/**
 * THE ICON VOCABULARY (FR-006, artboard 3): Lucide, 2px stroke on a 24 grid, drawn at 16 in a
 * row, 20 in a block head, 12 in a chip, 24 in the phone's tab bar. Grey unless the icon names a
 * kind or a state; red only when it destroys. Every icon the app draws is named here, by what it
 * means, so the same thing wears the same glyph in the icon bar, a sidebar, a block head, a
 * search result and a timeline; nothing else imports `lucide-react` (the lint).
 *
 * The board's full table, added here as each screen lands (knip holds this file to what is used):
 *   kinds    task square-check-big · meeting calendar-clock · person user-round · reading
 *            book-open (a link: link) · project folder (the inbox: inbox) · organisation
 *            building-2 · communication messages-square · note sticky-note · birthday cake
 *   places   workbench layout-dashboard · today sun · calendar calendar-days · review history ·
 *            search search · keys keyboard · account circle-user-round
 *   fields   email mail · phone phone · link link · hometown house · lives in map-pin-house ·
 *            place map-pin · time zone globe · repeats repeat · duration clock · family heart ·
 *            friends users-round · work briefcase
 *   actions  new plus · edit pencil · open beside panel-right · open link external-link · tree
 *            list-tree · board square-kanban · filter list-filter · drag grip-vertical · archive
 *            archive · more ellipsis · delete trash-2 (red) · close x
 *   status   backlog circle-dashed · to do circle · in progress a half-filled ring (not in
 *            Lucide; drawn by hand) · done circle-check · cancelled circle-x
 *   time     flag; waiting on another task: lock
 */
import type { ComponentProps, ComponentType } from 'react'
import {
  BookOpen,
  BuildingComplex,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Circle,
  Folder,
  Inbox,
  Keyboard,
  LayoutDashboard,
  MessagesSquare,
  Moon,
  PanelRight,
  Plus,
  RotateCcwClock,
  Search,
  SquareCheckBig,
  StickyNote,
  Sun,
  UserRound,
  X,
} from 'lucide-react'

export type IconComponent = ComponentType<ComponentProps<typeof Circle>>

/** The eight kinds, each in its own colour wherever it appears (FR-002). */
export const KIND_ICON = {
  task: SquareCheckBig,
  meeting: CalendarClock,
  person: UserRound,
  reading: BookOpen,
  project: Folder,
  organisation: BuildingComplex,
  communication: MessagesSquare,
  note: StickyNote,
} as const satisfies Record<string, IconComponent>
export type Kind = keyof typeof KIND_ICON

/** The project that is the inbox wears this instead of initials (FR-004). */
export const InboxIcon = Inbox

/** Places, always grey. */
export const PLACE_ICON = {
  workbench: LayoutDashboard,
  today: Sun,
  calendar: CalendarDays,
  review: RotateCcwClock,
  search: Search,
  keys: Keyboard,
} as const satisfies Record<string, IconComponent>

export const NewIcon = Plus
export const CloseIcon = X
export const OpenFullIcon = PanelRight
export const ExpandIcon = ChevronDown
export const CollapseIcon = ChevronRight
/** One step back or on: a month, a year. */
export const BackIcon = ChevronLeft
export const ForwardIcon = ChevronRight
/** The icon bar growing to show its names, and shrinking back. */
export const BarExpandIcon = ChevronsRight
export const BarCollapseIcon = ChevronsLeft
/** The theme switch shows the scheme it would switch TO. */
export const LightIcon = Sun
export const DarkIcon = Moon

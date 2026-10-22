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
  Cake,
  CalendarClock,
  CalendarDays,
  CircleAlert,
  CloudCheck,
  CloudOff,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Check,
  Circle,
  CornerDownRight,
  Ellipsis,
  FileCode,
  FileText,
  Flag,
  Folder,
  FolderOpen,
  GitPullRequest,
  Inbox,
  Keyboard,
  LayoutDashboard,
  Link,
  ListTree,
  MessagesSquare,
  Moon,
  PanelRight,
  Plus,
  RotateCcwClock,
  RotateCw,
  Search,
  SquareCheckBig,
  SquareKanban,
  StickyNote,
  Sun,
  Trash,
  UserRound,
  Video,
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

/** Linking one thing to another (FR-027); also a reading that is a link. */
export const LinkIcon = Link
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
/** A project's two views (FR-053), and the menu of what else can be done to it. */
export const TreeIcon = ListTree
export const BoardIcon = SquareKanban
export const MoreIcon = Ellipsis
/**
 * A resource by the service its address names (FR-046, DES-001 section 4): the shape says what
 * kind of place it is, and it stays grey, so it is never read as a state or a kind.
 */
export const RESOURCE_ICON = {
  'github-pr': GitPullRequest,
  'github-issue': GitPullRequest,
  github: GitPullRequest,
  'google-doc': FileText,
  'google-sheet': FileText,
  'google-slides': FileText,
  'google-drive': FolderOpen,
  overleaf: FileCode,
  figma: FileText,
  web: Link,
} as const satisfies Record<string, IconComponent>
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
/** What went wrong, trying again, and the connection (FR-032, FR-033). */
export const AlertIcon = CircleAlert
export const RetryIcon = RotateCw
export const OfflineIcon = CloudOff
export const OnlineIcon = CloudCheck
/** Destroying something: red, and only where it destroys (FR-006). */
export const RemoveIcon = Trash
/** The theme switch shows the scheme it would switch TO. */
export const LightIcon = Sun
export const DarkIcon = Moon

/** Time on Today (FR-079): a deadline's flag, a birthday's cake, a call's camera. */
export const FlagIcon = Flag
export const CakeIcon = Cake
export const JoinIcon = Video
/** Finishing a row, and a plan carried over from a day already gone. */
export const DoneIcon = Check
export const CarriedIcon = CornerDownRight
/** A task to do, not yet started. */
export const ToDoIcon = Circle

/** In progress: a ring with its right half filled, at an icon's size (not in Lucide). */
export function InProgressIcon({
  size = 16,
  className = '',
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>
  )
}

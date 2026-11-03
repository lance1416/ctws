/**
 * Every icon the app draws is named here, by what it means, so the same thing wears the same glyph
 * everywhere; nothing else imports `lucide-react` (the lint). Grey unless the icon names a kind or
 * a state; red only when it destroys.
 */
import type { ComponentProps, ComponentType } from 'react'
import {
  Archive,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  BuildingComplex,
  Cake,
  CalendarClock,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  CloudSun,
  CornerUpLeft,
  CloudCheck,
  CloudOff,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  Check,
  Circle,
  CornerDownRight,
  Ellipsis,
  FileCode,
  TextWrap,
  FileText,
  Flag,
  Folder,
  FolderOpen,
  History,
  GitPullRequest,
  Inbox,
  Keyboard,
  KeyRound,
  LayoutDashboard,
  Heading,
  Link,
  List,
  ListChecks,
  ListTree,
  Lock,
  LogOut,
  MapPin,
  Mail,
  Mailbox,
  MessageSquare,
  MessagesSquare,
  Music,
  Monitor,
  Palette,
  Moon,
  PanelLeftOpen,
  PanelRight,
  Pencil,
  Pin,
  Undo2,
  AtSign,
  Phone,
  Plus,
  Repeat,
  RotateCcwClock,
  RotateCw,
  ScanBarcode,
  Search,
  Share,
  Tag,
  Send,
  SquareCheckBig,
  SquareKanban,
  StickyNote,
  Sun,
  Trash,
  UserRound,
  UsersRound,
  Video,
  X,
  CircleDashed,
  Clock,
  Hourglass,
} from 'lucide-react'

export type IconComponent = ComponentType<ComponentProps<typeof Circle>>

/** The eight kinds, each in its own colour wherever it appears. */
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

/** Linking one thing to another; also a reading that is a link. */
export const LinkIcon = Link
/** The project that is the inbox wears this instead of initials. */
export const InboxIcon = Inbox
/** The projects set aside: their count under the overview, their list in the sidebar. */
export const ArchiveIcon = Archive

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
/** A project's two views, and the menu of what else can be done to it. */
export const TreeIcon = ListTree
export const BoardIcon = SquareKanban
/** The board's two ways to make its columns: by status, by stage. */
export const ByStatusIcon = CircleDashed
export const ByStageIcon = Flag
/** How long a node has been at its stage, on the board by stage: "5d". */
export const InStageIcon = Hourglass
/** A stage folded to a strip at the board's right edge, or shown as a column. */
export const FoldStageIcon = PanelLeftOpen
/** A sent message awaiting a reply by a day, on a card on the board by stage. */
export const FollowUpIcon = Send
export const MoreIcon = Ellipsis
/**
 * A resource by the service its address names: the shape says what kind of place it is, and it
 * stays grey, so it is never read as a state or a kind.
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
/** Editing what is being read, in place. */
export const EditIcon = Pencil
export const OpenFullIcon = PanelRight
export const ExpandIcon = ChevronDown
export const CollapseIcon = ChevronRight
/** One step back or on: a month, a year. */
export const BackIcon = ChevronLeft
export const ForwardIcon = ChevronRight
/** The phone's row over the keyboard. */
export const FORMAT_ICON = {
  heading: Heading,
  list: List,
  task: ListChecks,
  mention: AtSign,
  link: Link,
  undo: Undo2,
} as const satisfies Record<string, IconComponent>
/** A note pinned to the top of the list: one switch, on and off. */
export const PinIcon = Pin
/** Find's places: the one before, the next. */
export const FindPreviousIcon = ChevronUp
export const FindNextIcon = ChevronDown
/** The icon bar growing to show its names, and shrinking back. */
export const BarExpandIcon = ChevronsRight
export const BarCollapseIcon = ChevronsLeft
/** What went wrong, trying again, and the connection. */
export const AlertIcon = CircleAlert
export const RetryIcon = RotateCw
export const OfflineIcon = CloudOff
export const OnlineIcon = CloudCheck
/** Destroying something: red, and only where it destroys. */
export const RemoveIcon = Trash
/** The theme switch shows the scheme it would switch TO. */
export const LightIcon = Sun
export const DarkIcon = Moon
/** Following the system's light or dark. */
export const SystemIcon = Monitor
/** The account's Appearance block. */
export const AppearanceIcon = Palette
/** The account page's rows. */
export const SignOutIcon = LogOut
export const PasswordIcon = KeyRound
export const EmailIcon = Mail
export const TimeZoneIcon = Clock
/** The move to the new layout, and its report. */
export const MovedIcon = History

/** Time on Today: a deadline's flag, a birthday's cake, a call's camera. */
export const FlagIcon = Flag
export const CakeIcon = Cake
/** The people overview's blocks: in touch lately, not for a while, the circles. */
export const InTouchIcon = History
export const OutOfTouchIcon = Clock
/** How long something lasts: a meeting's "45m". */
export const DurationIcon = Clock
export const CirclesIcon = UsersRound
/** How the last exchange with someone went: a message sent, one received. */
export const SentIcon = Send
export const ReceivedIcon = Mailbox
/** A person's profile, section by section: how to reach them, where they are. */
export const ContactIcon = Mail
export const PlacesIcon = MapPin
/** An organisation's kind, beside its name: "Law firm". */
export const TypeIcon = Tag
/** A file attached to a message or a meeting's notes; a page is a link. */
export const FileIcon = FileText

/**
 * The workbench: the launcher's badge, going on to a page, coming back from a resource and
 * finishing what it was for, and the two widgets not built yet.
 */
export const LauncherIcon = ArrowUpRight
export const GoOnIcon = ArrowRight
export const ReturnedIcon = CornerUpLeft
export const MarkDoneIcon = CircleCheck
export const WeatherIcon = CloudSun
export const MusicIcon = Music

/** A meeting that repeats: its rule's tag, and its earlier occurrences. */
export const RepeatIcon = Repeat

/** A way to reach someone: the icon its row's kind button wears. */
export const REACH_ICON = { email: Mail, phone: Phone, url: Link } as const satisfies Record<
  string,
  IconComponent
>

/** How a message went: its channel, on the form's buttons. */
export const CHANNEL_ICON = {
  email: Mail,
  call: Phone,
  message: MessageSquare,
  in_person: UsersRound,
  other: Ellipsis,
} as const satisfies Record<string, IconComponent>

/** When a reminder comes: "3 days before". */
export const RemindIcon = Bell
/** Waiting on another task that is not finished. */
export const LockIcon = Lock
export const JoinIcon = Video
/** Finishing a row, and a plan carried over from a day already gone. */
export const DoneIcon = Check
export const CarriedIcon = CornerDownRight
/** A task to do, not yet started. */
export const ToDoIcon = Circle
/** Reading's imports to come: a barcode to scan, and a link shared in from another app. */
export const ScanIcon = ScanBarcode
export const ShareInIcon = Share

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
/** A note shown as its Markdown source. */
export const FileCodeIcon = FileCode
/** How long a note's lines run. */
export const LineLengthIcon = TextWrap

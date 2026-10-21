import { KIND_ICON, PLACE_ICON, type IconComponent, type Kind } from '../../platform/ui/icons'

/**
 * THE ICON BAR'S ELEVEN ENTRIES (FR-019), in its order: the pages that cut across every kind,
 * then one entry per kind. A kind's icon wears the kind's colour; a page's is grey. Adding a kind
 * is one more row here.
 */
export type Place = {
  id: string
  label: string
  /** The module's root: its overview, with its sidebar. */
  to: string
  icon: IconComponent
  /** The kind this module holds, or null for a page across kinds. */
  kind: Kind | null
  /** The key after `G` that comes here (FR-029). */
  key: string
}

export const PLACES: readonly Place[] = [
  {
    id: 'workbench',
    label: 'Workbench',
    to: '/',
    icon: PLACE_ICON.workbench,
    kind: null,
    key: 'w',
  },
  { id: 'today', label: 'Today', to: '/today', icon: PLACE_ICON.today, kind: null, key: 't' },
  {
    id: 'calendar',
    label: 'Calendar',
    to: '/calendar',
    icon: PLACE_ICON.calendar,
    kind: null,
    key: 'c',
  },
  { id: 'review', label: 'Review', to: '/review', icon: PLACE_ICON.review, kind: null, key: 'v' },
  {
    id: 'projects',
    label: 'Projects',
    to: '/projects',
    icon: KIND_ICON.project,
    kind: 'project',
    key: 'p',
  },
  {
    id: 'people',
    label: 'People',
    to: '/people',
    icon: KIND_ICON.person,
    kind: 'person',
    key: 'e',
  },
  {
    id: 'organisations',
    label: 'Organisations',
    to: '/organisations',
    icon: KIND_ICON.organisation,
    kind: 'organisation',
    key: 'o',
  },
  {
    id: 'meetings',
    label: 'Meetings',
    to: '/meetings',
    icon: KIND_ICON.meeting,
    kind: 'meeting',
    key: 'm',
  },
  {
    id: 'communication',
    label: 'Communication',
    to: '/communication',
    icon: KIND_ICON.communication,
    kind: 'communication',
    key: 'x',
  },
  {
    id: 'reading',
    label: 'Reading',
    to: '/reading',
    icon: KIND_ICON.reading,
    kind: 'reading',
    key: 'r',
  },
  { id: 'notes', label: 'Notes', to: '/notes', icon: KIND_ICON.note, kind: 'note', key: 'n' },
]

/** How many entries come before the line across the bar. */
export const PAGES_BEFORE_THE_LINE = 4

/** The place a path is in: the one whose root it is under, the Workbench only at the root. */
export function placeOf(pathname: string): Place | null {
  return (
    PLACES.find((p) =>
      p.to === '/' ? pathname === '/' : pathname === p.to || pathname.startsWith(`${p.to}/`),
    ) ?? null
  )
}

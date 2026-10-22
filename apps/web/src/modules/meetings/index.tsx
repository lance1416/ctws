import { topPage } from '../../shell/layout'
import type { WorkspaceModule } from '../../shell/contract'
import { useProjectMeetings } from './hooks/projectThings'
import { meetingKeys } from './api'
import { CalendarOccurrence } from './components/OccurrencePane'
import { NextMeetingLine } from './components/MeetingsKind'
import { MeetingsAside, TodayMeetings } from './components/TodayMeetings'
import { useMeetingEntries } from './hooks/contributions'
import { MEETINGS_ID } from './logic/id'
import { MeetingFact } from './components/MeetingFact'
import { NewMeeting } from './components/NewMeeting'
import { Meetings } from './pages/Meetings'

/**
 * Meetings: a page of its own, timed calendar entries, and a Workbench card for today. No search
 * provider: a meeting is found by its date, and a weekly title repeats many times over.
 * No project-page block: meetings reach a project as edges, which the shell draws for every kind.
 */
const PAGE = topPage('Meetings')

export const meetingModule: WorkspaceModule = {
  id: MEETINGS_ID,
  label: 'Meetings',
  kind: {
    label: 'Meetings',
    to: `/${MEETINGS_ID}`,
    Status: NextMeetingLine,
    chord: 'meetings',
    order: 30,
  },
  routes: [
    { index: true, element: <Meetings />, handle: PAGE },
    // A meeting has no page of its own: this is the list with its pane open.
    { path: ':id', element: <Meetings />, handle: PAGE },
  ],
  creates: [{ kind: 'meeting', key: 'm', label: 'Meeting', Dialog: NewMeeting }],
  chords: [
    {
      id: 'meetings',
      key: 'm',
      label: 'Meetings',
      resolve: () => `/${MEETINGS_ID}`,
      order: 40,
    },
  ],
  calendar: {
    label: 'Meetings',
    useEntries: useMeetingEntries,
    // A meeting agreed elsewhere says where, and its time on that clock.
    show: (e) => ({
      to: '/calendar',
      label: e.zone ? `meeting · ${e.zone} ${e.zoneTime}` : 'Meetings',
    }),
    // Clicked, it opens in a pane over the grid, named in the address like the Meetings page's.
    opens: {
      params: (e) => ({ meeting: e.id, at: e.recurrenceId ?? '' }),
      Pane: CalendarOccurrence,
    },
  },
  widgets: [
    {
      id: 'today',
      label: 'Meetings',
      to: `/${MEETINGS_ID}`,
      Component: TodayMeetings,
      Aside: MeetingsAside,
      order: 20,
      span: 6,
    },
  ],
  // A project's page lists the meetings coming up in it (FR-055).
  project: { Things: { kind: 'meeting', useThings: useProjectMeetings } },
  relations: [
    {
      type: 'meeting',
      kind: 'Meeting',
      plural: 'Meetings',
      to: (id) => `/${MEETINGS_ID}/${id}`,
      Fact: MeetingFact,
    },
  ],
  // An occurrence names its attendees and its project.
  reads: [{ queryKey: meetingKeys.all, of: ['meeting', 'person', 'project'] }],
}

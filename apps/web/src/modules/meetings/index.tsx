import { kindPage } from '../../shell/layout'
import type { WorkspaceModule } from '../../shell/contract'
import { CalendarDetail } from './components/CalendarDetail'
import { MeetingsTodayCount, NextMeetingLine } from './components/MeetingsKind'
import { MeetingsAside, TodayMeetings } from './components/TodayMeetings'
import { useMeetingEntries } from './hooks/contributions'
import { MEETINGS_ID } from './logic/id'
import { Meetings } from './pages/Meetings'

/**
 * Meetings: a page of its own, timed calendar entries, and a Workbench card for today. No search
 * provider: a meeting is found by its date, and a weekly title repeats many times over.
 * No project-page block: meetings reach a project as edges, which the shell draws for every kind.
 */
const PAGE = kindPage('Meetings')

export const meetingModule: WorkspaceModule = {
  id: MEETINGS_ID,
  label: 'Meetings',
  kind: {
    label: 'Meetings',
    to: `/${MEETINGS_ID}`,
    Count: MeetingsTodayCount,
    Status: NextMeetingLine,
    chord: 'meetings',
    order: 30,
  },
  routes: [
    { index: true, element: <Meetings />, handle: PAGE },
    // A meeting has no page of its own: this is the list with its pane open.
    { path: ':id', element: <Meetings />, handle: PAGE },
  ],
  chords: [
    {
      id: 'meetings',
      key: 'm',
      label: 'Go to Meetings',
      resolve: () => `/${MEETINGS_ID}`,
      order: 16,
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
    Detail: CalendarDetail,
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
  relations: [
    {
      type: 'meeting',
      kind: 'Meeting',
      to: (id) => `/${MEETINGS_ID}/${id}`,
    },
  ],
}

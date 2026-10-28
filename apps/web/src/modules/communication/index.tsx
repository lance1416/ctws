import { topPage } from '../../shell/layout'
import { MessageNarrow } from './components/MessageNarrow'
import { ReceivedIcon, SentIcon } from '../../platform/ui/icons'
import type { WorkspaceModule } from '../../shell/contract'
import { communicationKeys } from './api'
import { AwaitingCount } from './components/CommunicationFacts'
import { CommunicationSidebar } from './components/CommunicationSidebar'
import { FollowUpsToday } from './components/FollowUpsToday'
import { MessageFact, MessageMark } from './components/MessageFacts'
import { NewMessage } from './components/NewMessage'
import { useFollowUpEntries } from './hooks/followUpEntries'
import { useProjectAwaiting } from './hooks/projectThings'
import { COMMUNICATION_ID } from './logic/id'
import { CommunicationOverview } from './pages/CommunicationOverview'
import { Message } from './pages/Message'
import { AwaitingReply } from './widgets/AwaitingReply'

const PAGE = topPage('Communication')

/**
 * Communication (FR-048, FR-070, FR-071): logging an exchange from any page, the overview of who
 * has not replied and where each organisation stands, each exchange's page, and Today's Follow up.
 */
export const communicationModule: WorkspaceModule = {
  id: COMMUNICATION_ID,
  label: 'Communication',
  kind: {
    label: 'Communication',
    to: `/${COMMUNICATION_ID}`,
    Count: AwaitingCount,
    List: CommunicationSidebar,
    chord: 'communication',
    // After Meetings, before Reading, as on the bar (FR-019).
    order: 35,
  },
  routes: [
    { index: true, element: <CommunicationOverview />, handle: PAGE },
    { path: ':id', element: <Message />, handle: PAGE },
  ],
  creates: [{ kind: 'communication', key: 'x', label: 'Message', Dialog: NewMessage }],
  chords: [
    {
      id: 'communication',
      key: 'x',
      label: 'Communication',
      resolve: () => `/${COMMUNICATION_ID}`,
      order: 45,
    },
  ],
  weekCounts: [
    { key: 'messagesSent', label: 'Messages sent', icon: SentIcon, order: 30 },
    { key: 'messagesReceived', label: 'Messages received', icon: ReceivedIcon, order: 40 },
  ],
  today: [{ id: 'follow-up', order: 10, Block: FollowUpsToday }],
  widgets: [{ place: 'awaiting', Component: AwaitingReply }],
  // The day each is to be chased (FR-080); the workbench's week shows them too (FR-076).
  calendar: {
    label: 'Follow-ups',
    useEntries: useFollowUpEntries,
    show: (e) => ({ to: `/${COMMUNICATION_ID}/${e.id}`, label: 'follow up' }),
  },
  // A project's page lists who is waiting for a reply in it (FR-055).
  project: { Things: { kind: 'communication', useThings: useProjectAwaiting } },
  relations: [
    {
      type: 'communication',
      kind: 'Communication',
      plural: 'Communication',
      to: (id) => `/${COMMUNICATION_ID}/${id}`,
      Mark: MessageMark,
      Fact: MessageFact,
      Narrow: MessageNarrow,
    },
  ],
  // Who it was with, and what they are called, and where it is filed.
  reads: [
    {
      queryKey: communicationKeys.all,
      of: ['communication', 'person', 'organisation', 'project', 'task'],
    },
  ],
}

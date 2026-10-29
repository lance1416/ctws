import { lazyPage } from '../../platform/ui/lazyPage'
import { thingPage, topPage } from '../../shell/layout'
import { MessageNarrow } from './components/MessageNarrow'
import { ReceivedIcon, SentIcon } from '../../platform/ui/icons'
import type { WorkspaceModule } from '../../shell/contract'
import { awaitingQuery, communicationKeys, followUpsQuery } from './api'
import { AwaitingCount, AwaitingMoreCount } from './components/CommunicationFacts'
import { CommunicationSidebar } from './components/CommunicationSidebar'
import { FollowUpsPhone, FollowUpsToday } from './components/FollowUpsToday'
import { MessageFact, MessageMark } from './components/MessageFacts'
import { NewMessage } from './components/NewMessage'
import { useFollowUpEntries } from './hooks/followUpEntries'
import { useProjectAwaiting } from './hooks/projectThings'
import { COMMUNICATION_ID } from './logic/id'
import { AwaitingReply } from './widgets/AwaitingReply'
import { followUpLists } from './components/FollowUpsToday'
const Message = lazyPage(() => import('./pages/Message').then((m) => m.Message))
const CommunicationOverview = lazyPage(() =>
  import('./pages/CommunicationOverview').then((m) => m.CommunicationOverview),
)

const PAGE = topPage('Communication')
/** One of them, under its kind in the breadcrumbs (FR-018). */
const THING = thingPage('Communication', '/communication')

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
    MoreCount: AwaitingMoreCount,
    List: CommunicationSidebar,
    chord: 'communication',
    // After Meetings, before Reading, as on the bar (FR-019).
    order: 35,
  },
  routes: [
    { index: true, element: <CommunicationOverview />, handle: PAGE },
    { path: ':id', element: <Message />, handle: THING },
  ],
  // The kind's name, as everywhere (DES-001 "种类名"); its button says the act: Log a message.
  creates: [{ kind: 'communication', key: 'x', label: 'Communication', Dialog: NewMessage }],
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
  today: [
    {
      id: 'follow-up',
      order: 10,
      Block: FollowUpsToday,
      Phone: FollowUpsPhone,
      prefetch: (qc) => void qc.prefetchQuery(followUpsQuery()),
    },
  ],
  widgets: [{ place: 'awaiting', Component: AwaitingReply }],
  // The day each is to be chased (FR-080); the workbench's week shows them too (FR-076).
  calendar: {
    label: 'Follow-ups',
    useEntries: useFollowUpEntries,
    prefetch: (qc) => void qc.prefetchQuery(awaitingQuery()),
    show: (e) => ({ to: `/${COMMUNICATION_ID}/${e.id}`, label: 'follow up' }),
  },
  // A project's page lists who is waiting for a reply in it (FR-055).
  project: {
    Things: {
      kind: 'communication',
      useThings: useProjectAwaiting,
      prefetch: (qc) => void qc.prefetchQuery(awaitingQuery()),
    },
  },
  lists: followUpLists,
  relations: [
    {
      type: 'communication',
      kind: 'Communication',
      plural: 'Communication',
      to: (id) => `/${COMMUNICATION_ID}/${id}`,
      Mark: MessageMark,
      Fact: MessageFact,
      Narrow: MessageNarrow,
      // Edited in place on its page: Edit takes it there with the editor open (I-05).
      edit: (id) => `/${COMMUNICATION_ID}/${id}?edit=1`,
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

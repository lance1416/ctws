import { lazyPage } from '../../platform/ui/lazyPage'
import { Navigate } from 'react-router-dom'
import { PersonNarrow } from './components/PersonNarrow'
import { KIND_ICON } from '../../platform/ui/icons'
import { thingPage, topPage } from '../../shell/layout'
import type { WorkspaceModule } from '../../shell/contract'
import { useProjectPeople } from './hooks/projectThings'
import { birthdayCalendarQuery, birthdaysQuery, peopleKeys, peopleQuery } from './api'
import { UpcomingBirthdays } from './widgets/UpcomingBirthdays'
import { NextBirthdayLine, PeopleCount } from './components/PeopleKind'
import { BirthdaysPhone, BirthdaysToday } from './components/BirthdaysToday'
import { NewPerson } from './components/NewPerson'
import { PersonFact, PersonMark } from './components/PersonFacts'
import { useBirthdayEntries } from './hooks/contributions'
import { describePersonChange } from './logic/describeChange'
import { PEOPLE_ID } from './logic/id'
import { PeopleSidebar } from './components/PeopleSidebar'
import { Person, PersonEdit, PersonNew } from './pages/Person'
import { peopleLists } from './components/TouchLists'
import { personProjectsList } from './components/PersonProjects'
import { prefetchPerson } from './pages/PersonPage'
const People = lazyPage(() => import('./pages/People').then((m) => m.People))

// For other modules: a meeting picks its attendees from this list.
export { usePeople } from './hooks/usePeople'

/**
 * People, with Birthdays as a tab, search, birthday calendar entries and a birthday card.
 * No capture rule: a pasted address is likelier a note about someone than a person to file.
 * No project-page block: people reach a project as edges, which the shell draws for every kind.
 */
const PAGE = topPage('People')
/** One of them, under its kind in the breadcrumbs (FR-018). */
const THING = thingPage('People', '/people')

export const peopleModule: WorkspaceModule = {
  id: PEOPLE_ID,
  label: 'People',
  // Birthdays is a view of people, so it is a tab on their page and not a second entry here.
  kind: {
    label: 'People',
    to: `/${PEOPLE_ID}`,
    Count: PeopleCount,
    Status: NextBirthdayLine,
    List: PeopleSidebar,
    chord: 'people',
    order: 20,
  },
  routes: [
    { index: true, element: <People />, handle: PAGE },
    // Birthdays is the sidebar's list now (FR-060), not a page: an old address lands there.
    { path: 'birthdays', element: <Navigate to="/people?list=birthdays" replace /> },
    // Before `:id`, which would take `new` for an id.
    { path: 'new', element: <PersonNew />, handle: PAGE },
    { path: ':id', element: <Person />, handle: { ...THING, prefetch: prefetchPerson } },
    { path: ':id/edit', element: <PersonEdit />, handle: PAGE },
  ],
  calendar: {
    label: 'Birthdays',
    useEntries: useBirthdayEntries,
    prefetch: (qc, range) => void qc.prefetchQuery(birthdayCalendarQuery(range)),
    // The name only (CA-02); the day itself says the age it turns, when the year is known.
    show: (e) => ({ to: `/people/${e.id}`, label: 'Birthday' }),
  },
  widgets: [{ place: 'birthdays', Component: UpcomingBirthdays }],
  weekCounts: [{ key: 'peopleAdded', label: 'People added', icon: KIND_ICON.person, order: 60 }],
  creates: [{ kind: 'person', key: 'p', label: 'Person', Dialog: NewPerson }],
  chords: [
    {
      id: 'people',
      key: 'e',
      label: 'People',
      resolve: () => `/${PEOPLE_ID}`,
      order: 30,
      was: 'g n',
    },
  ],
  today: [
    {
      id: 'birthdays',
      order: 40,
      Block: BirthdaysToday,
      Phone: BirthdaysPhone,
      prefetch: (qc) => void qc.prefetchQuery(birthdaysQuery()),
    },
  ],
  // A project's page lists the people on it (FR-055).
  project: {
    Things: {
      kind: 'person',
      useThings: useProjectPeople,
      prefetch: (qc) => void qc.prefetchQuery(peopleQuery()),
    },
  },
  lists: [...peopleLists, personProjectsList],
  relations: [
    {
      type: 'person',
      kind: 'Person',
      plural: 'People',
      to: (id) => `/${PEOPLE_ID}/${id}`,
      Mark: PersonMark,
      Fact: PersonFact,
      describeChange: describePersonChange,
      Narrow: PersonNarrow,
      edit: (id) => `/${PEOPLE_ID}/${id}/edit`,
    },
  ],
  // A person names the projects they are on.
  reads: [{ queryKey: peopleKeys.all, of: ['person', 'project'] }],
}

import { topPage } from '../../shell/layout'
import type { WorkspaceModule } from '../../shell/contract'
import { peopleKeys } from './api'
import { BirthdayCard } from './components/BirthdayCard'
import { NextBirthdayLine, PeopleCount } from './components/PeopleKind'
import { useBirthdayEntries, usePeopleHits } from './hooks/contributions'
import { PEOPLE_ID } from './logic/id'
import { Birthdays } from './pages/Birthdays'
import { People } from './pages/People'

// For other modules: a meeting picks its attendees from this list.
export { usePeople } from './hooks/usePeople'

/**
 * People, with Birthdays as a tab, search, birthday calendar entries and a birthday card.
 * No capture rule: a pasted address is likelier a note about someone than a person to file.
 * No project-page block: people reach a project as edges, which the shell draws for every kind.
 */
const PAGE = topPage('People')

export const peopleModule: WorkspaceModule = {
  id: PEOPLE_ID,
  label: 'People',
  // Birthdays is a view of people, so it is a tab on their page and not a second entry here.
  kind: {
    label: 'People',
    to: `/${PEOPLE_ID}`,
    Count: PeopleCount,
    Status: NextBirthdayLine,
    chord: 'people',
    order: 20,
  },
  routes: [
    { index: true, element: <People />, handle: PAGE },
    // Before `:id`, so a reader need not know that react-router ranks a static segment higher.
    { path: 'birthdays', element: <Birthdays />, handle: PAGE },
    // A person has no page of their own: this is the list with their pane open.
    { path: ':id', element: <People />, handle: PAGE },
  ],
  search: { useHits: usePeopleHits },
  calendar: {
    label: 'Birthdays',
    useEntries: useBirthdayEntries,
    // The age it turns follows the name, when the year is known.
    show: (e) => ({
      to: `/people/${e.id}`,
      label: 'Birthday',
      ...(e.turns !== null ? { title: `${e.title} ${e.turns}` } : {}),
    }),
  },
  widgets: [
    {
      id: 'birthdays',
      label: 'Birthdays',
      to: `/${PEOPLE_ID}/birthdays`,
      Component: BirthdayCard,
      order: 40,
      span: 4,
    },
  ],
  creates: [{ kind: 'person', key: 'p', label: 'Person', to: `/${PEOPLE_ID}` }],
  chords: [
    {
      id: 'people',
      key: 'e',
      label: 'Go to People',
      resolve: () => `/${PEOPLE_ID}`,
      order: 30,
      was: 'g n',
    },
  ],
  relations: [
    {
      type: 'person',
      kind: 'Person',
      plural: 'People',
      to: (id) => `/${PEOPLE_ID}/${id}`,
      describe: (t) => (t.type === 'person' ? t.org : null),
    },
  ],
  // A person names the projects they are on.
  reads: [{ queryKey: peopleKeys.all, of: ['person', 'project'] }],
}

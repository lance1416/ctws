import { LINK } from '../../platform/ui/buttonStyles'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { birthdayCalendarQuery, birthdaysQuery, peopleQuery, personSearchQuery } from './api'
import { PanelEmpty } from '../../platform/ui/Panel'
import { countdownPhrase, shortDay, weekdayOf } from '../../platform/time/dates'
import { Birthdays } from './pages/Birthdays'
import { People } from './pages/People'
import type { SearchHit, WorkspaceModule } from '../../shell/contract'

/**
 * People, with Birthdays as a tab, search, birthday calendar entries and a birthday card.
 * No capture rule: a pasted address is likelier a note about someone than a person to file.
 */
const ID = 'people'

/** No `Detail`: a birthday's entry links to its person's page. */
function useBirthdayEntries(range: { from: string; to: string }) {
  const result = useQuery(birthdayCalendarQuery(range))
  return { entries: result.data ?? [], isError: result.isError }
}

/**
 * The people whose reminder lead has come round, as the server decides. Nothing pushes, so a week
 * the app is never opened is a week it cannot tell you.
 */
function BirthdayCard() {
  const view = useQuery(birthdaysQuery())
  const rows = view.data?.card ?? []
  const next = view.data?.coming[0] ?? view.data?.later[0]
  const today = view.data?.today ?? ''
  if (view.isError) {
    return (
      <p role="alert" className="px-2 py-1.5 text-sm text-danger">
        Couldn&apos;t load birthdays
      </p>
    )
  }
  if (rows.length === 0) {
    // Empty means no lead has come round, not that nobody is due this week: a birthday in three
    // days with a same-day reminder is both. Only with no next person is no birthday recorded.
    return (
      <PanelEmpty>
        {next ? (
          <>
            Nobody to greet yet.{' '}
            <Link to={`/${ID}/birthdays`} className={LINK}>
              {next.name} is next, {countdownPhrase(next.inDays)}.
            </Link>
          </>
        ) : (
          'No birthdays yet.'
        )}
      </PanelEmpty>
    )
  }
  const [first, ...more] = rows
  return (
    <div className="px-2">
      <Link to={`/${ID}/${first!.personId}`} data-birthday-row className="block">
        <span className="block text-xl font-semibold">{first!.name}</span>
        <span className="mt-0.5 block">
          {weekdayOf(first!.day, true)}, {shortDay(first!.day, today)},{' '}
          {countdownPhrase(first!.inDays)}
        </span>
        {first!.lunarDate && (
          <span className="block text-sm text-ink-subtle">{first!.lunarDate}</span>
        )}
      </Link>
      {more.length > 0 && (
        <ul className="mt-3.5 flex flex-col">
          {more.slice(0, 2).map((r) => (
            <li key={r.personId}>
              <Link
                to={`/${ID}/${r.personId}`}
                data-birthday-row
                className="flex min-h-[30px] items-baseline gap-2.5 pt-1 text-sm hover:bg-hover"
              >
                <span className="min-w-0 truncate">{r.name}</span>
                <span className="ml-auto shrink-0 text-ink-subtle tabular-nums">
                  {r.inDays === 0 ? 'today' : shortDay(r.day, today)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Everyone, by name: the list other modules pick people from (a meeting's attendees). */
export const usePeople = () => useQuery(peopleQuery())

function PeopleCount() {
  const people = usePeople()
  if (!people.data) return null
  const n = people.data.length
  return (
    <span data-count>
      {n} {n === 1 ? 'person' : 'people'}
    </span>
  )
}

function NextBirthdayLine() {
  const view = useQuery(birthdaysQuery())
  const next = view.data ? [...view.data.coming, ...view.data.later][0] : undefined
  if (!next) return null
  // No punctuation after the name: a Han name would get the engine's Han-Latin gap before a comma.
  return (
    <span data-status>
      Next birthday: {next.name} {countdownPhrase(next.inDays)}
    </span>
  )
}

function usePeopleHits(query: string) {
  const results = useQuery({
    ...personSearchQuery(query),
    enabled: query.length > 0,
  })
  const hits: SearchHit[] = (results.data ?? []).map((person) => ({
    id: person.id,
    to: `/${ID}/${person.id}`,
    title: person.name,
    meta: [person.org, ...person.projects.map((p) => p.name), person.channels[0]?.value]
      .filter(Boolean)
      .join(' · '),
    mark: null,
  }))
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}

// No project-page block: people reach a project as edges, which the shell draws for every kind.
export const peopleModule: WorkspaceModule = {
  id: ID,
  label: 'People',
  // Birthdays is a view of people, so it is a tab on their page and not a second entry here.
  kind: {
    label: 'People',
    to: `/${ID}`,
    Count: PeopleCount,
    Status: NextBirthdayLine,
    chord: 'people',
    order: 20,
  },
  routes: [
    { index: true, element: <People /> },
    // Before `:id`, so a reader need not know that react-router ranks a static segment higher.
    { path: 'birthdays', element: <Birthdays /> },
    // A person has no page of their own: this is the list with their pane open.
    { path: ':id', element: <People /> },
  ],
  search: { useHits: usePeopleHits },
  calendar: { label: 'Birthdays', useEntries: useBirthdayEntries },
  widgets: [
    {
      id: 'birthdays',
      label: 'Birthdays',
      to: `/${ID}/birthdays`,
      Component: BirthdayCard,
      order: 40,
      span: 4,
    },
  ],
  chords: [
    { id: 'people', key: 'n', label: 'Go to People', resolve: () => `/${ID}`, order: 17 },
    {
      id: 'birthdays',
      key: 'b',
      label: 'Go to Birthdays',
      resolve: () => `/${ID}/birthdays`,
      // Not 18: the shell's Calendar holds it, and a shared order sorts by spread order.
      order: 19,
    },
  ],
  relations: [
    {
      type: 'person',
      kind: 'Person',
      to: (id) => `/${ID}/${id}`,
    },
  ],
}

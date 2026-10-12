import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { birthdayCalendar, birthdaysKey, listBirthdays } from '../api/birthdays'
import { searchContacts } from '../api/contacts'
import { BirthdayRow } from '../components/BirthdayRow'
import { PanelEmpty } from '../components/Panel'
import { countdownPhrase } from '../dueAt'
import { Birthdays } from '../routes/Birthdays'
import { Contacts } from '../routes/Contacts'
import type { SearchHit, WorkspaceModule } from './contract'

/**
 * THE CONTACTS MODULE -- the third, and the first one that contributes NOTHING new to the seam.
 *
 * That is the point of it being third: a seam a new module can be built against without changing
 * it is a seam that has stopped being a draft.
 *
 * It contributes a rail row, a chord, a search provider, a project block and where one of its
 * people lives. And nothing else:
 * - a WORKBENCH card, but only for BIRTHDAYS. An address book is not something in front of you,
 *   and a card listing people would be decoration on the one page that is supposed to hold only
 *   what is live -- but whose birthday it is this week is exactly that.
 * - CALENDAR entries: birthdays. They are here because somebody ASKED for them, not because a
 *   slot was empty -- which is what the previous version of this comment refused, and rightly,
 *   until the asking happened. A birthday has no time of day and wears no colour.
 * - no CAPTURE rule. A pasted email address is far likelier to be a note about someone than a
 *   person to file, and a wrong guess here would be silently filing things in the wrong module.
 */
const ID = 'contacts'

/**
 * This module's dated things. No `Detail`: a birthday belongs to a person, and that person has a
 * page of their own, so the entry is a link rather than something that opens here.
 */
function useBirthdayEntries(range: { from: string; to: string }) {
  const result = useQuery({
    queryKey: ['birthday-calendar', range.from, range.to],
    queryFn: () => birthdayCalendar(range),
  })
  return { entries: result.data ?? [], isError: result.isError }
}

/**
 * THE WORKBENCH CARD: the few birthdays that come TO you.
 *
 * WHO appears is the server's answer (each person by their own lead), not a filter written again
 * here. This card is the only place in the app that comes looking for you -- a real push would need
 * a scheduler, and v1 deliberately has no background anything. So the cost is stated plainly: a
 * week you never open CTWS is a week it cannot tell you.
 */
function BirthdayCard() {
  const view = useQuery({ queryKey: birthdaysKey(), queryFn: listBirthdays })
  const rows = view.data?.card ?? []
  const next = view.data?.coming[0] ?? view.data?.later[0]
  if (view.isError) {
    return (
      <p role="alert" className="px-2 py-1.5 text-sm text-danger">
        Couldn&apos;t load birthdays
      </p>
    )
  }
  if (rows.length === 0) {
    // 空着的意思是没人到提前量，不是一周之内没人 -- 三天后生日、只要当天提醒的人同时满足两者，
    // 说「一周没人」就是在当面说错话。没有下一个人，才是真的一个生日都没记。
    return (
      <PanelEmpty>
        {next ? (
          <>
            Nobody to greet yet.{' '}
            <Link to={`/${ID}/birthdays`} className="text-accent">
              {next.name} is next, {countdownPhrase(next.inDays)}.
            </Link>
          </>
        ) : (
          'No birthdays yet.'
        )}
      </PanelEmpty>
    )
  }
  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <BirthdayRow key={row.contactId} row={row} today={view.data?.today ?? ''} />
      ))}
    </ul>
  )
}

/** The rail's count: how many birthdays the next week holds. Shares the page's cache entry. */
function BirthdayCount() {
  const view = useQuery({ queryKey: birthdaysKey(), queryFn: listBirthdays })
  const count = view.data?.coming.length ?? 0
  if (count <= 0) return null
  return (
    <span data-count className="ml-auto pl-1 text-xs text-fg-muted">
      {count}
    </span>
  )
}

/** This module's half of federated search: names, organisations and addresses. */
function useContactHits(query: string) {
  const results = useQuery({
    queryKey: ['contact-search', query],
    queryFn: () => searchContacts(query),
    enabled: query.length > 0,
  })
  const hits: SearchHit[] = (results.data ?? []).map((person) => ({
    id: person.id,
    to: `/${ID}`,
    title: person.name,
    // What identifies a person at a glance is where they are from and how to reach them.
    meta: [person.org, ...person.projects.map((p) => p.name), person.channels[0]?.value]
      .filter(Boolean)
      .join(' · '),
    mark: null,
  }))
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}

/**
 * NO BLOCK ON A PROJECT PAGE.
 *
 * This module's rows reach a project as edges, and the shell draws every kind of edge the same way.
 * One of these is made on its own page and filed there, or dropped into the capture box, never from
 * a project page.
 */

export const contactModule: WorkspaceModule = {
  id: ID,
  label: 'Contacts',
  destinations: [
    { id: 'list', to: `/${ID}`, label: 'Contacts', zone: 'things', order: 30 },
    // A VIEW, not a thing: it looks at people through their dates and makes nobody.
    {
      id: 'birthdays',
      to: `/${ID}/birthdays`,
      label: 'Birthdays',
      zone: 'views',
      // Between the calendar and the review: those two look forward and back, and whose birthday
      // is next is the forward-looking one.
      order: 15,
      Count: BirthdayCount,
    },
  ],
  routes: [
    { index: true, element: <Contacts /> },
    // Before `:id`, so a reader need not know that react-router ranks a static segment higher.
    { path: 'birthdays', element: <Birthdays /> },
    // 一个人没有自己的页：这条路渲染的是列表加他的那一层（`Contacts` 从 URL 读开着的是谁）。
    // 任务也是这样接的，而项目保留整页 —— 它有任务树，那是真的需要一整页的东西。
    { path: ':id', element: <Contacts /> },
  ],
  search: { useHits: useContactHits },
  calendar: { label: 'Birthdays', useEntries: useBirthdayEntries },
  widgets: [
    { id: 'birthdays', label: 'Birthdays', to: `/${ID}/birthdays`, Component: BirthdayCard },
  ],
  // `n` for name. One keyspace across modules, so this is checked against every other chord.
  chords: [
    { id: 'contacts', key: 'n', label: 'Go to Contacts', resolve: () => `/${ID}`, order: 17 },
    {
      id: 'birthdays',
      key: 'b',
      label: 'Go to Birthdays',
      resolve: () => `/${ID}/birthdays`,
      // 19 and not 18: the shell's Calendar already holds 18, and two chords with one order leave
      // the teaching order to whichever list was spread first.
      order: 19,
    },
  ],
  relations: [
    {
      type: 'contact',
      kind: 'Person',
      to: (id) => `/${ID}/${id}`,
    },
  ],
}

import type { Circle, PersonResponse } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { sortByName } from '../peopleOrder'
import { BirthdayLead } from './BirthdayRow'
import { PanelEmpty } from '../../../platform/ui/Panel'
import { BODY_GUTTER, ProjectRail } from '../../../shell/rows/RowParts'

/**
 * A LIST OF PEOPLE, on the app's row: `[margin][thread][body]`.
 *
 * - The MARGIN is the one date a person has: their next birthday, beside a cake.
 * - The THREAD is their first line of work's colour, so a list of people reads against the rail's
 *   projects the way a list of tasks does.
 * - The BODY says who: an initial, the name, what they do and for whom, and the city at the far
 *   end. One link, to their address -- the whole row is the target, not four characters of a name.
 *
 * How to reach them is in their sheet, a click away: a row that also carried every address was
 * two rows' worth of text per person, and the list is read to find someone, not to write to them.
 */
export function PeopleList({
  people,
  openId,
  emptyLine,
}: {
  people: readonly PersonResponse[]
  /** The person whose sheet is open: their row says so. */
  openId: string | null
  emptyLine: string
}) {
  if (people.length === 0) return <PanelEmpty>{emptyLine}</PanelEmpty>
  return (
    <ul className="flex flex-col">
      {sortByName(people).map((person) => {
        const open = person.id === openId
        const meta = metaOf(person)
        return (
          <li key={person.id} data-person-row={person.id} className="flex min-h-14 min-w-0">
            <BirthdayLead next={person.birthday?.next ?? null} />
            <ProjectRail projectId={person.projects[0]?.id ?? null} />
            <Link
              to={`/people/${person.id}`}
              aria-current={open ? 'page' : undefined}
              className={`flex min-w-0 flex-1 items-center gap-3.5 py-2 pr-2 pl-[var(--gutter)] hover:bg-hover ${BODY_GUTTER} ${
                open ? 'bg-select' : ''
              }`}
            >
              <span
                aria-hidden="true"
                data-person-initial
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-select text-sm font-semibold text-ink-muted"
              >
                {initialOf(person.name)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span data-person-name className={`truncate text-ink ${open ? 'font-medium' : ''}`}>
                  {person.name}
                </span>
                {meta && (
                  <span data-person-meta className="truncate text-sm text-ink-subtle">
                    {meta}
                  </span>
                )}
              </span>
              {person.city && (
                <span className="max-w-[40%] shrink-0 truncate text-sm text-ink-subtle">
                  {person.city}
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * What they do, and for whom: "Engineering manager, Acme". Someone with neither -- a relative, a
 * friend -- is said by their circle instead, which is what they are to you.
 *
 * Then the lines of work they are on, BY NAME: the thread carries the first one's colour, and a
 * project's colour never stands alone (WCAG 1.4.1) -- slots 4 to 6 are under 3:1 on the sheet.
 */
function metaOf(person: PersonResponse): string {
  const work = [person.title, person.org].filter(Boolean).join(', ')
  const who = work || (person.circle ? ONE_OF[person.circle] : '')
  const on = person.projects.map((p) => p.name).join(', ')
  return [who, on].filter(Boolean).join(' · ')
}

/** One person's circle, singular: the filter's labels are plural because they name groups. */
const ONE_OF: Record<Circle, string> = { family: 'Family', friend: 'Friend', work: 'Work' }

/** The first character as a reader counts them (not a UTF-16 half), capitalised if it has a case. */
function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? '').toUpperCase()
}

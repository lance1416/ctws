import type { PersonResponse } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { sortByName } from '../logic/peopleOrder'
import { BirthdayLead } from './BirthdayRow'
import { CIRCLE_OF_ONE } from '../logic/labels'
import { PanelEmpty } from '../../../platform/ui/Panel'
import { ProjectRail, ROW_BODY } from '../../../shell/rows'

/**
 * People on the app's row: the next birthday in the margin, the first project's colour as the
 * thread, then who they are. The whole row is one link to their sheet.
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
              className={`${ROW_BODY} items-center gap-3.5 py-2 pr-2 hover:bg-hover ${
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
 * Their work ("Engineering manager, Acme"), or their circle when there is none, then their projects
 * by name so the thread's colour is never the only signal.
 */
function metaOf(person: PersonResponse): string {
  const work = [person.title, person.org].filter(Boolean).join(', ')
  const who = work || (person.circle ? CIRCLE_OF_ONE[person.circle] : '')
  const on = person.projects.map((p) => p.name).join(', ')
  return [who, on].filter(Boolean).join(' · ')
}

/** The first character as a reader counts them (not a UTF-16 half), capitalised if it has a case. */
function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? '').toUpperCase()
}

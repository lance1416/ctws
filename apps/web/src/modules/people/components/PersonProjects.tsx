import type { PersonResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { KIND_ICON } from '../../../platform/ui/icons'
import type { InspectorList } from '../../../shell/contract'
import { ListHead, NarrowRow, useShowInInspector } from '../../../shell/inspector'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { peopleQuery } from '../api'

/** How many project squares a person's head shows before the rest fold into "+N" (FR-061). */
export const SHOWN_PROJECTS = 5

/** The full list's name in the inspector's address: `?inspect=list:person-projects.<id>`. */
const PERSON_PROJECTS = 'person-projects'

/**
 * "+4" after a person's five project squares (FR-061, DES-001 "人物页"): a square's size and
 * corners, muted, its count in even figures; pressed, every project in the inspector.
 */
export function MoreProjects({ person, more }: { person: PersonResponse; more: number }) {
  const show = useShowInInspector()
  const words = `${more} more ${more === 1 ? 'project' : 'projects'}`
  return (
    <button
      type="button"
      title={words}
      aria-label={words}
      onClick={() => show({ type: 'list', id: `${PERSON_PROJECTS}.${person.id}` })}
      className="inline-grid size-5 place-items-center rounded-key bg-hover text-initials text-muted tabular-nums hover:bg-select max-lg:tap"
    >
      +{more}
    </button>
  )
}

/** Every project a person is in, the one that moved last first, with their open tasks in it. */
function PersonProjectsList({ arg }: { arg: string }) {
  const people = useQuery(peopleQuery())
  const every = useEveryProject()
  const person = people.data?.find((p) => p.id === arg)
  if (!person) return null
  const rows = person.projects.flatMap((p) => {
    const project = every.data?.find((e) => e.id === p.id)
    return project ? [{ ...p, project }] : []
  })
  return (
    <>
      <ListHead
        badge={{ icon: KIND_ICON.project, tint: 'bg-project-bg text-project' }}
        title="Projects"
        count={rows.length}
      />
      <ul className="flex flex-col px-4 py-3">
        {rows.map((r) => (
          <NarrowRow
            key={r.id}
            mark={<ProjectSquare project={r.project} />}
            thing={{ type: 'project', id: r.id }}
            to={`/projects/${r.id}`}
            title={r.name}
            fact={
              <span className="tabular-nums" title={`${r.openTasks} open with ${person.name}`}>
                {r.openTasks}
              </span>
            }
          />
        ))}
      </ul>
    </>
  )
}

export const personProjectsList: InspectorList = {
  name: PERSON_PROJECTS,
  label: 'People',
  icon: KIND_ICON.project,
  Body: PersonProjectsList,
}

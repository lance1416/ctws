import { useQuery } from '@tanstack/react-query'
import { Avatar } from '../../../platform/ui/Avatar'
import { KIND_ICON, PlacesIcon, TypeIcon } from '../../../platform/ui/icons'
import { NarrowBlocks, NarrowHead, NarrowRow, PropRow, PropRows } from '../../../shell/inspector'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { Timeline } from '../../../shell/timeline'
import { organisationsQuery } from '../api'
import { ORGANISATIONS_ID } from '../logic/id'
import { Website } from '../pages/OrganisationPage'
import { OrganisationMark } from './OrganisationMark'
import { StageOf } from './Standing'

const TAG = 'inline-flex h-5.5 items-center gap-1 rounded-key bg-hover px-2 text-muted'

/**
 * AN ORGANISATION IN THE INSPECTOR (FR-022, artboard 33): its mark and name, what it is and
 * where; its website; the people there now; the projects it is in, at their stage; and the
 * latest of its timeline.
 */
export function OrganisationNarrow({ id }: { id: string }) {
  const organisations = useQuery(organisationsQuery())
  const projects = useEveryProject()
  const o = organisations.data?.find((x) => x.id === id)
  if (organisations.isSuccess && !o)
    return <p className="p-4 text-ui text-muted">This organisation is not here any more.</p>
  if (!o) return null
  const page = `/${ORGANISATIONS_ID}/${o.id}`
  return (
    <>
      <NarrowHead
        mark={<OrganisationMark name={o.name} />}
        title={o.name}
        tags={
          <>
            {o.type && (
              <span className={TAG}>
                <TypeIcon size={12} aria-hidden="true" />
                {o.type}
              </span>
            )}
            {o.city && (
              <span className={TAG}>
                <PlacesIcon size={12} aria-hidden="true" />
                {o.city}
              </span>
            )}
          </>
        }
      />
      <PropRows>
        <PropRow icon={KIND_ICON.organisation} label="Website">
          {o.website && <Website url={o.website} />}
        </PropRow>
      </PropRows>
      <NarrowBlocks
        blocks={[
          {
            key: 'people',
            title: 'People',
            count: `${o.people.now.length} now`,
            empty: o.people.now.length === 0 ? 'Nobody there now' : null,
            all: o.people.now.length > 5 ? { label: `All ${o.people.now.length}`, to: page } : null,
            body: (
              <ul className="flex flex-col">
                {o.people.now.slice(0, 5).map((p) => (
                  <NarrowRow
                    key={p.personId}
                    mark={<Avatar initials={p.initials} />}
                    thing={{ type: 'person', id: p.personId }}
                    to={`/people/${p.personId}`}
                    title={p.name}
                    fact={p.title}
                  />
                ))}
              </ul>
            ),
          },
          {
            key: 'projects',
            title: 'In projects',
            empty: o.inProjects.length === 0 ? 'In no project' : null,
            body: (
              <ul className="flex flex-col">
                {o.inProjects.slice(0, 5).map((s) => {
                  const project = projects.data?.find((p) => p.id === s.projectId)
                  return (
                    <NarrowRow
                      key={s.projectId}
                      mark={project && <ProjectSquare project={project} />}
                      thing={{ type: 'project', id: s.projectId }}
                      to={`/projects/${s.projectId}`}
                      title={project?.name ?? ''}
                      fact={<StageOf standing={s} />}
                    />
                  )
                })}
              </ul>
            ),
          },
          {
            key: 'timeline',
            title: 'Timeline',
            body: (
              <Timeline
                of={{ type: 'organisation', id: o.id }}
                last={5}
                everything={{ label: `Everything with ${o.name}`, to: page }}
              />
            ),
          },
        ]}
      />
    </>
  )
}

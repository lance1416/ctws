import { useQuery } from '@tanstack/react-query'
import { Block, BlockFailed } from '../../../../platform/ui/Block'
import { KIND_ICON } from '../../../../platform/ui/icons'
import { ProjectSquare, useProjects } from '../../../../shell/projects'
import { movementQuery } from '../../api'
import { hasMovement, isQuiet } from '../../logic/movement'

/**
 * THIS WEEK, CLOSED PER PROJECT (FR-079, artboard 12): what each project finished this week, as a
 * bar against the busiest and a count; a project left too long says it has gone quiet instead.
 * The inbox is not a line of work and is left out, as is a project with nothing open or closed.
 */
export function WeekBlock({ today }: { today: string }) {
  const movement = useQuery(movementQuery(today))
  const projects = useProjects()
  const badge = { icon: KIND_ICON.project, tint: 'bg-project-bg text-project' }
  if (movement.isError)
    return (
      <Block badge={badge} title="This week">
        <BlockFailed what="this week" onRetry={() => void movement.refetch()} />
      </Block>
    )
  const lines = (movement.data ?? []).flatMap((m) => {
    const project = projects.data?.find((p) => p.id === m.projectId)
    // A project with nothing open and nothing closed has nothing to say this week.
    return project && !project.isInbox && hasMovement(m) ? [{ m, project }] : []
  })
  const most = Math.max(1, ...lines.map((l) => l.m.doneThisWeek))
  return (
    <Block
      badge={badge}
      title="This week"
      count={<span className="font-normal">Closed per project</span>}
      empty={movement.isSuccess && lines.length === 0 ? 'No projects yet' : null}
    >
      <ul className="grid grid-cols-[20px_96px_minmax(0,1fr)_28px] items-center gap-x-2.5 gap-y-2.5 px-3 py-2.5">
        {lines.map(({ m, project }) => (
          <li key={m.projectId} data-week-row={m.projectId} className="contents">
            <ProjectSquare project={project} />
            <span className="truncate text-ui text-ink">{project.name}</span>
            {isQuiet(m) ? (
              <span
                data-stagnant={m.projectId}
                className="inline-flex h-5.5 items-center justify-self-start rounded-control bg-warn-bg px-2 text-meta font-medium whitespace-nowrap text-warn-t"
              >
                Quiet for {m.quietDays} days
              </span>
            ) : (
              <span aria-hidden="true" className="flex h-1.5 overflow-hidden rounded-full bg-line">
                <span className="bg-go" style={{ width: `${(m.doneThisWeek / most) * 100}%` }} />
              </span>
            )}
            <span
              className={`justify-self-end text-ui tabular-nums ${m.doneThisWeek === 0 ? 'text-muted' : 'text-ink'}`}
              aria-label={`${m.doneThisWeek} closed this week`}
            >
              {m.doneThisWeek}
            </span>
          </li>
        ))}
      </ul>
    </Block>
  )
}

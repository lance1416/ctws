import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Block, BlockFailed } from '../../../../platform/ui/Block'
import { BUTTON } from '../../../../platform/ui/buttonStyles'
import { ToDoIcon } from '../../../../platform/ui/icons'
import { ProjectSquare, useEveryProject } from '../../../../shell/projects'
import { readyQuery, todayQuery } from '../../api'
import { useTaskActions } from '../../hooks/useTaskActions'
import { ALL_ROW, TODAY_LISTS } from '../../components/TodayLists'
import { AllInInspector } from '../../../../shell/inspector'

/** How many leaves the block offers; the rest are its "All N", beside it (FR-011). */
const SHOWN = 5

/**
 * READY TO START (FR-041, FR-079, artboard 12): leaves waiting for nothing and not already on
 * Today's lists, each with Start. Two lines a row, its own columns: what it is, and where it sits.
 */
export function ReadyBlock({ today }: { today: string }) {
  const ready = useQuery(readyQuery(today))
  // What the left column already lists is not offered again here.
  const listed = new Set((useQuery(todayQuery(today)).data ?? []).map((t) => t.id))
  const projects = useEveryProject()
  const [error, setError] = useState<string | null>(null)
  const actions = useTaskActions(setError)
  const offered = (ready.data ?? []).filter((t) => !listed.has(t.id))
  const rows = offered.slice(0, SHOWN)
  const badge = { icon: ToDoIcon, tint: 'bg-task-bg text-task' }
  if (ready.isError)
    return (
      <Block badge={badge} title="Ready to start">
        <BlockFailed what="tasks ready to start" onRetry={() => void ready.refetch()} />
      </Block>
    )
  return (
    <Block
      badge={badge}
      title="Ready to start"
      count={offered.length}
      empty={ready.isSuccess && rows.length === 0 ? 'Nothing waiting' : null}
    >
      <ul className="p-1.5">
        {rows.map((t) => {
          const project = projects.data?.find((p) => p.id === t.projectId)
          const where = t.path.at(-1)?.title ?? t.projectName
          return (
            <li
              key={t.id}
              data-ready-row={t.id}
              className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-control px-3 py-1 hover:bg-hover"
            >
              <ToDoIcon size={16} aria-hidden="true" className="text-muted" />
              <span className="flex min-w-0 flex-col py-1">
                <span className="truncate text-ui text-ink">{t.title}</span>
                <span className="inline-flex min-w-0 items-center gap-1.5 text-meta text-muted">
                  {project && <ProjectSquare project={project} />}
                  <span className="truncate">{where}</span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => actions.setStatus(t.id, 'in_progress')}
                aria-label={`Start “${t.title}”`}
                className={`${BUTTON.secondary} h-6.5 px-2.5 text-meta`}
              >
                Start
              </button>
            </li>
          )
        })}
      </ul>
      {offered.length > SHOWN && (
        <AllInInspector list={TODAY_LISTS.ready} count={offered.length} className={ALL_ROW} />
      )}
      {error && (
        <p role="alert" className="px-3 pb-2.5 text-ui text-stop-t">
          {error}
        </p>
      )}
    </Block>
  )
}

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Block, BlockFailed, SkeletonRows } from '../../../platform/ui/Block'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { GoOnIcon, InProgressIcon, ToDoIcon } from '../../../platform/ui/icons'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { BackFromCard } from '../../../shell/resources'
import { useRowsThatFit } from '../../../shell/workbench'
import { readyQuery, todayQuery } from '../api'
import { useTaskActions } from '../hooks/useTaskActions'
import { todaySegments } from '../logic/today'
import { DoneButton, DueChip, TaskPath } from '../pages/today/TaskLine'

/** In progress shows at most this many; Ready to start has the rest of the room. */
const IN_PROGRESS_SHOWN = 4
const READY_SHOWN = 5
/** One row; and what is not rows: a caption over each list, and the gap between them. */
const ROW_PX = 38
const CAPTIONS_PX = 2 * 22 + 10

/** Status, title, where it sits, its deadline, what to do: Today's columns, a little narrower. */
const ROW =
  'grid min-h-9.5 grid-cols-[16px_minmax(0,1fr)_190px_96px_auto] items-center gap-x-3 rounded-control px-3 hover:bg-hover max-lg:grid-cols-[16px_minmax(0,1fr)_auto]'
const CAPTION = 'px-3 pb-1.5 text-meta font-medium tracking-[0.06em] text-subtle uppercase'

const opens = (t: { id: string; projectId: string }) => `/projects/${t.projectId}?task=${t.id}`

/**
 * NOW ON THE WORKBENCH (FR-076, artboards 10 and 22): coming back from a resource (FR-028), then
 * the leaves in progress, each with the tick that finishes it, then the leaves ready to start
 * (FR-041), each with Start; as many as the place holds. The rest of the day is in Today.
 */
export function NowWidget() {
  const today = useAccountToday()
  const timeZone = useTimeZone()
  const listed = useQuery(todayQuery(today))
  const ready = useQuery(readyQuery(today))
  const [error, setError] = useState<string | null>(null)
  const actions = useTaskActions(setError)
  // What is left after the captions is rows, each list held to its own most.
  const [lists, rows] = useRowsThatFit(ROW_PX, IN_PROGRESS_SHOWN + READY_SHOWN, CAPTIONS_PX)
  const inProgress = todaySegments(listed.data ?? []).inProgress.filter((t) => !t.children)
  const startable = ready.data ?? []
  const working = inProgress.slice(0, Math.min(IN_PROGRESS_SHOWN, rows))
  const next = startable.slice(0, Math.min(READY_SHOWN, Math.max(0, rows - working.length)))
  const failed = listed.isError || ready.isError

  return (
    <Block badge={{ icon: InProgressIcon, tint: 'bg-go-bg text-go' }} title="Now">
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <BackFromCard />
        {failed ? (
          <BlockFailed
            what="tasks"
            onRetry={() => {
              void listed.refetch()
              void ready.refetch()
            }}
          />
        ) : !listed.isSuccess || !ready.isSuccess ? (
          <SkeletonRows rows={4} />
        ) : (
          <div ref={lists} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
            <section aria-label="In progress" className="flex flex-col">
              <h3 className={CAPTION}>
                In progress <span className="ml-1.5 tabular-nums">{inProgress.length}</span>
              </h3>
              {inProgress.length === 0 && (
                <p className="px-3 text-ui text-subtle">Nothing in progress</p>
              )}
              <ul>
                {working.map((t) => (
                  <li key={t.id} data-now-working={t.id} className={ROW}>
                    <InProgressIcon size={16} className="text-go" />
                    <Link to={opens(t)} className="truncate text-ui font-medium text-ink">
                      {t.title}
                    </Link>
                    <TaskPath task={t} />
                    <DueChip dueAt={t.dueAt} today={today} timeZone={timeZone} />
                    <span className="justify-self-end">
                      <DoneButton
                        id={t.id}
                        title={t.title}
                        onDone={() => actions.setStatus(t.id, 'done')}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Ready to start" className="flex flex-col">
              <h3 className={CAPTION}>
                Ready to start <span className="ml-1.5 tabular-nums">{startable.length}</span>
              </h3>
              {startable.length === 0 && (
                <p className="px-3 text-ui text-subtle">Nothing waiting</p>
              )}
              <ul>
                {next.map((t) => (
                  <li key={t.id} data-now-ready={t.id} className={ROW}>
                    <ToDoIcon size={16} aria-hidden="true" className="text-muted" />
                    <Link to={opens(t)} className="truncate text-ui text-ink">
                      {t.title}
                    </Link>
                    <TaskPath task={{ ...t, parentTitle: t.path.at(-1)?.title ?? null }} />
                    <DueChip dueAt={t.dueAt} today={today} timeZone={timeZone} />
                    <button
                      type="button"
                      onClick={() => actions.setStatus(t.id, 'in_progress')}
                      aria-label={`Start “${t.title}”`}
                      className={`${BUTTON.secondary} h-6.5 justify-self-end px-2.5 text-meta`}
                    >
                      Start
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
        {error && (
          <p role="alert" className="px-3 text-ui text-stop-t">
            {error}
          </p>
        )}
        <Link
          to="/today"
          className="mt-auto flex shrink-0 items-center gap-1.5 px-3 text-ui text-muted hover:text-ink"
        >
          <span className="flex-1">Everything for today is in Today</span>
          <GoOnIcon size={16} aria-hidden="true" />
        </Link>
      </div>
    </Block>
  )
}

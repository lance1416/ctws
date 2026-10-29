import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Block, BlockFailed, SkeletonRows } from '../../../platform/ui/Block'
import { GoOnIcon, InProgressIcon, ToDoIcon } from '../../../platform/ui/icons'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { BackFromCard } from '../../../shell/resources'
import { useRowsThatFit } from '../../../shell/workbench'
import { readyQuery, todayQuery } from '../api'
import { useTaskActions } from '../hooks/useTaskActions'
import { nowRows } from '../logic/nowRows'
import { offeredReady, todaySegments } from '../logic/today'
import { DoneButton, DueChip, TaskPath } from '../pages/today/TaskLine'
import { RowAction } from '../components/RowAction'

/** Where Now has no height of its own (one column, on a phone): this many rows. */
const ROWS_UNFIXED = 9
/** One row; and what is not rows: a caption over each list shown, and the gap between two. */
const ROW_PX = 38
const CAPTION_PX = 22
const GAP_PX = 10

/** Status, title, where it sits, its deadline, what to do: Today's columns, a little narrower. */
const ROW =
  'grid min-h-9.5 grid-cols-[16px_minmax(0,1fr)_190px_96px_auto] items-center gap-x-3 rounded-control px-3 hover:bg-hover max-lg:grid-cols-[16px_minmax(0,1fr)_auto]'
const CAPTION = 'px-3 pb-1.5 text-meta font-medium tracking-[0.06em] text-subtle uppercase'

const opens = (t: { id: string; projectId: string }) => `/projects/${t.projectId}?task=${t.id}`

/**
 * NOW ON THE WORKBENCH (FR-076, FR-078, artboards 10 and 22): coming back from a resource
 * (FR-028), then the leaves in progress, each with the tick that finishes it, then the leaves
 * ready to start (FR-041), each with Start; as many as the place holds, shared by `nowRows`. A
 * list with nothing in it is left out. The rest of the day is in Today.
 */
export function NowWidget() {
  const today = useAccountToday()
  const timeZone = useTimeZone()
  const listed = useQuery(todayQuery(today))
  const ready = useQuery(readyQuery(today))
  const [error, setError] = useState<string | null>(null)
  const actions = useTaskActions(setError)
  const inProgress = todaySegments(listed.data ?? []).inProgress.filter((t) => !t.children)
  const startable = offeredReady(ready.data ?? [], listed.data ?? [])
  const lists = (inProgress.length > 0 ? 1 : 0) + (startable.length > 0 ? 1 : 0)
  // What is left after the captions is rows, shared between the two lists.
  const [measured, rows] = useRowsThatFit(
    ROW_PX,
    ROWS_UNFIXED,
    lists * CAPTION_PX + (lists === 2 ? GAP_PX : 0),
    true,
  )
  const share = nowRows(rows, inProgress.length, startable.length)
  const working = inProgress.slice(0, share.inProgress)
  const next = startable.slice(0, share.ready)
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
          <div ref={measured} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
            {lists === 0 && (
              <p className="px-3 text-ui text-subtle">Nothing in progress or ready to start.</p>
            )}
            {inProgress.length > 0 && (
              <section aria-label="In progress" className="flex flex-col">
                <h3 className={CAPTION}>
                  In progress <span className="ml-1.5 tabular-nums">{inProgress.length}</span>
                </h3>
                <ul>
                  {working.map((t) => (
                    <li key={t.id} data-now-working={t.id} className={ROW}>
                      <InProgressIcon size={16} className="text-go" />
                      <Link
                        to={opens(t)}
                        className="truncate text-ui font-medium text-ink max-lg:py-3"
                      >
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
            )}
            {startable.length > 0 && (
              <section aria-label="Ready to start" className="flex flex-col">
                <h3 className={CAPTION}>
                  Ready to start <span className="ml-1.5 tabular-nums">{startable.length}</span>
                </h3>
                <ul>
                  {next.map((t) => (
                    <li key={t.id} data-now-ready={t.id} className={ROW}>
                      <ToDoIcon size={16} aria-hidden="true" className="text-muted" />
                      <Link to={opens(t)} className="truncate text-ui text-ink max-lg:py-3">
                        {t.title}
                      </Link>
                      <TaskPath task={{ ...t, parentTitle: t.path.at(-1)?.title ?? null }} />
                      <DueChip dueAt={t.dueAt} today={today} timeZone={timeZone} />
                      <RowAction
                        label={`Start “${t.title}”`}
                        onPress={() => actions.setStatus(t.id, 'in_progress')}
                        className="justify-self-end"
                      >
                        Start
                      </RowAction>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="px-3 text-ui text-stop-t">
            {error}
          </p>
        )}
        <Link
          to="/today"
          className="mt-auto flex shrink-0 items-center gap-1.5 px-3 text-ui text-muted hover:text-ink max-lg:min-h-11"
        >
          <span className="flex-1">Everything for today is in Today</span>
          <GoOnIcon size={16} aria-hidden="true" />
        </Link>
      </div>
    </Block>
  )
}

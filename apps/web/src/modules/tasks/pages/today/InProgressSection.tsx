import { type TaskStatus, type TodayTaskResponse, type TaskId } from '@ctws/contracts'
import type { KeyboardEvent } from 'react'
import { BUTTON } from '../../../../platform/ui/buttonStyles'
import {
  DayEmpty,
  DaySection,
  leadFor,
  ProjectRail,
  ROW_BODY,
  ROW_LIST,
  RowLead,
} from '../../../../shell/rows'
import { toggleDoneTarget, toggleStartTarget } from '../../logic/status'
import { StatusButton } from '../../components/StatusControls'
import { StatusMark } from '../../components/StatusMark'
import { opensOnClick, OVER_ROW, SavedMark } from '../../components/TaskRowParts'
import { taskCrumb } from '../../logic/crumb'

/**
 * One task in progress is the focal point, in large type with Done and Pause beside it; several
 * step down to rows.
 */
export function InProgressSection({
  tasks,
  today,
  timeZone,
  savedId,
  rowRef,
  onOpen,
  onKeyDown,
  onStatus,
}: {
  tasks: readonly TodayTaskResponse[]
  today: string
  timeZone: string
  savedId: string | null
  /** Each title button's ref: the row's focus carrier. */
  rowRef: (id: TaskId) => (el: HTMLElement | null) => () => void
  onOpen: (id: TaskId) => void
  onKeyDown: (e: KeyboardEvent, t: TodayTaskResponse) => void
  onStatus: (id: TaskId, status: TaskStatus) => void
}) {
  const alone = tasks.length === 1
  return (
    <DaySection label="In progress" count={alone ? undefined : tasks.length}>
      {tasks.length === 0 ? (
        <DayEmpty>Nothing in progress</DayEmpty>
      ) : (
        <ul className={ROW_LIST}>
          {tasks.map((t) => {
            // The server files a task planned up to today under Today, so any plan here is later.
            const lead = leadFor(t, today, timeZone)
            return (
              <li
                key={t.id}
                onClick={(e) => {
                  if (opensOnClick(e)) onOpen(t.id)
                }}
                className="group flex cursor-pointer items-stretch"
              >
                <RowLead lead={lead} />
                <ProjectRail projectId={t.projectId} />
                <div
                  className={`${ROW_BODY} relative items-start gap-x-2.5 pr-2 group-hover:bg-hover ${
                    alone ? 'flex-wrap gap-y-2 py-2' : 'min-h-11'
                  }`}
                >
                  {/* Several: the mark is the Done control, and on a touch screen the only one. */}
                  <span className="flex h-11 shrink-0 items-center">
                    {alone ? (
                      <StatusMark status={t.status} />
                    ) : (
                      <StatusButton
                        status={t.status}
                        title={t.title}
                        onClick={() => onStatus(t.id, toggleDoneTarget(t.status))}
                      />
                    )}
                  </span>
                  <button
                    type="button"
                    ref={rowRef(t.id)}
                    data-today-row={t.id}
                    onClick={() => onOpen(t.id)}
                    onKeyDown={(e) => onKeyDown(e, t)}
                    // One: at least 12rem, so Done and Pause wrap under a short title rather than
                    // squeeze it.
                    className={`flex flex-1 flex-col text-left ${
                      alone ? 'min-w-[min(12rem,100%)]' : 'min-w-0 py-2.5'
                    }`}
                  >
                    <span className="flex min-w-0 items-baseline">
                      <span
                        data-doing-title
                        // One: in full, on as many lines as it takes. Several: one line each.
                        className={`font-semibold ${
                          alone
                            ? 'min-w-0 text-2xl [overflow-wrap:anywhere] max-sm:text-xl'
                            : 'truncate text-base'
                        }`}
                      >
                        {t.title}
                      </span>
                      {savedId === t.id && <SavedMark />}
                    </span>
                    <span className="truncate text-sm text-ink-muted">{taskCrumb(t)}</span>
                  </button>
                  {/* The visible word is in the accessible name: "Done" in “Complete “Title””. */}
                  <span
                    className={`flex shrink-0 items-center gap-2 ${
                      alone
                        ? 'self-center'
                        : // Over the row, not in it: they take no width from the title.
                          `absolute top-0 right-1 h-11 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:hidden ${OVER_ROW}`
                    }`}
                  >
                    {/* Several: the mark is already Done, so a second Done is not drawn. */}
                    {alone && (
                      <button
                        type="button"
                        aria-label={`Complete “${t.title}”`}
                        onClick={() => onStatus(t.id, toggleDoneTarget(t.status))}
                        className={BUTTON.primary}
                      >
                        Done
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Pause “${t.title}”`}
                      onClick={() => onStatus(t.id, toggleStartTarget(t.status))}
                      className={BUTTON.secondary}
                    >
                      Pause
                    </button>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </DaySection>
  )
}

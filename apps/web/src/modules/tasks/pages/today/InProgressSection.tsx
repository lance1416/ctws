import type { TaskStatus, TodayTaskResponse } from '@ctws/contracts'
import type { KeyboardEvent } from 'react'
import { BUTTON } from '../../../../platform/ui/buttonStyles'
import { DayEmpty, DaySection } from '../../../../shell/rows/DaySection'
import { RowLead } from '../../../../shell/rows/RowLead'
import { ProjectRail, ROW_LIST } from '../../../../shell/rows/RowParts'
import { leadFor } from '../../../../shell/rows/leads'
import { toggleDoneTarget, toggleStartTarget } from '../../api/taskActions'
import { StatusButton } from '../../components/StatusControls'
import { StatusMark } from '../../components/StatusMark'
import { opensOnClick, OVER_ROW, SavedMark } from '../../components/TaskRowParts'
import { taskCrumb } from '../../crumb'

/**
 * IN PROGRESS -- the first thing the eye should land on.
 *
 * THE SIZE ANSWERS "HOW MANY". One thing in progress is THE thing: its title takes the scale's
 * 36/44 step, with Done and Pause beside it. Several are a list -- several 36px lines are a wall,
 * not a focal point -- so they step down to rows.
 */
export function InProgressSection({
  tasks,
  today,
  timeZone,
  savedId,
  onOpen,
  onKeyDown,
  onStatus,
}: {
  tasks: readonly TodayTaskResponse[]
  today: string
  timeZone: string
  savedId: string | null
  onOpen: (id: string) => void
  onKeyDown: (e: KeyboardEvent, t: TodayTaskResponse) => void
  onStatus: (id: string, status: TaskStatus) => void
}) {
  const alone = tasks.length === 1
  return (
    <DaySection label="In progress" count={alone ? undefined : tasks.length}>
      {tasks.length === 0 ? (
        <DayEmpty>Nothing in progress</DayEmpty>
      ) : (
        <ul className={ROW_LIST}>
          {tasks.map((t) => {
            const lead = leadFor(
              { dueAt: t.dueAt, scheduledOn: t.scheduledOn === today ? null : t.scheduledOn },
              today,
              timeZone,
            )
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
                  className={`relative flex min-w-0 flex-1 items-start gap-x-2.5 pr-2 pl-3.5 group-hover:bg-hover ${
                    alone ? 'flex-wrap gap-y-2 py-2' : 'min-h-11'
                  }`}
                >
                  {/* One: the mark, and Done beside it. Several: the mark IS the Done control,
                      which is all a touch screen gets -- Pause and the rest are in the sheet. */}
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
                    data-today-row={t.id}
                    onClick={() => onOpen(t.id)}
                    onKeyDown={(e) => onKeyDown(e, t)}
                    // One: at least 12rem, so Done and Pause wrap under a short line rather than
                    // squeeze it -- never more than the row has. Several: a row.
                    className={`flex flex-1 flex-col text-left ${
                      alone ? 'min-w-[min(12rem,100%)]' : 'min-w-0 py-2.5'
                    }`}
                  >
                    <span className="flex min-w-0 items-baseline">
                      <span
                        data-doing-title
                        // One: in full, on as many lines as it takes -- it is the line the page
                        // is for. Several: a list, one line each.
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
                  {/* The visible word is in the accessible name (WCAG 2.5.3): "Done" in
                      “Complete “Title””. On a list they wait for the pointer. */}
                  <span
                    className={`flex shrink-0 items-center gap-2 ${
                      alone
                        ? 'self-center'
                        : // Over the row, not in it: they take no width from the title.
                          `absolute top-0 right-1 h-11 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:hidden ${OVER_ROW}`
                    }`}
                  >
                    {/* One thing: the one press the page is for, filled. Several: the mark at the
                        row's start is Done, so a second Done would be one action with two names. */}
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

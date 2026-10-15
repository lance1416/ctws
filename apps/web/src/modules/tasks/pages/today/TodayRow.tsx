import type { TaskStatus, TodayTaskResponse } from '@ctws/contracts'
import type { KeyboardEvent } from 'react'
import { RowLead } from '../../../../shell/rows/RowLead'
import { ProjectRail } from '../../../../shell/rows/RowParts'
import { leadFor } from '../../../../shell/rows/leads'
import { toggleDoneTarget, toggleStartTarget } from '../../api/taskActions'
import { blockedLabel } from '../../blockedLabel'
import { StartButton, StatusButton } from '../../components/StatusControls'
import { opensOnClick, RowMeta, RowNote, SavedMark } from '../../components/TaskRowParts'
import { TriageControl } from '../../components/TriageControl'
import { taskCrumb } from '../../crumb'
import { dateHints } from '../../dueDates'
import { triageSections, type TriagePatch } from '../../triage'

/**
 * ONE TASK ROW on Today, on the anatomy: the margin, the thread, then the body -- marker, title
 * and where it came from, a note on the right, then the controls, which wait for the pointer or
 * the keyboard. Where there is no hover they are always there.
 */
export function TodayRow({
  task: t,
  anyTime = false,
  today,
  timeZone,
  now,
  saved,
  onOpen,
  onKeyDown,
  onStatus,
  onPatch,
  onRan,
}: {
  task: TodayTaskResponse
  /** On the day's line among timed things, an untimed row says so in the margin. */
  anyTime?: boolean
  today: string
  timeZone: string
  now: Date
  saved: boolean
  onOpen: () => void
  onKeyDown: (e: KeyboardEvent) => void
  onStatus: (status: TaskStatus) => void
  onPatch: (id: string, body: TriagePatch) => void
  /** A triage action ran; its menu is gone, so focus needs somewhere to go. */
  onRan: () => void
}) {
  const hints = dateHints(t, timeZone, now)
  // A plan for a day already gone, still not done: carried over, and said so on the right.
  const carried = t.segment === 'today' && t.scheduledOn !== null && t.scheduledOn < today
  const sections = triageSections(t, carried ? 'Carried over' : null, today, timeZone, onPatch)
  const lead =
    leadFor(
      // A plan for TODAY says nothing on a page called Today, and nor does a carried one: the
      // margin of the day's line is its times. The day it was first meant for is said on the right.
      { dueAt: t.dueAt, scheduledOn: t.scheduledOn === today || carried ? null : t.scheduledOn },
      today,
      timeZone,
    ) ?? (anyTime ? { text: 'Any time', tone: 'quiet' as const, flag: false } : null)
  const carriedFrom =
    carried && leadFor({ dueAt: null, scheduledOn: t.scheduledOn }, today, timeZone)?.text
  return (
    <li
      onClick={(e) => {
        if (opensOnClick(e)) onOpen()
      }}
      className={`group relative flex cursor-pointer items-stretch ${
        // BLOCKED ROWS DIM AND STAY: Today answers what can be worked on, and a list that loses
        // tasks cannot be trusted.
        t.blockedBy.length > 0 ? 'opacity-60' : ''
      }`}
    >
      <RowLead lead={lead} />
      <ProjectRail projectId={t.projectId} />
      <div className="flex min-h-11 min-w-0 flex-1 items-start gap-x-2.5 pr-2 pl-3.5 group-hover:bg-hover">
        <span className="flex h-11 shrink-0 items-center">
          <StatusButton
            status={t.status}
            title={t.title}
            onClick={() => onStatus(toggleDoneTarget(t.status))}
          />
        </span>
        <button
          type="button"
          data-today-row={t.id}
          onClick={onOpen}
          onKeyDown={onKeyDown}
          className="flex min-w-0 flex-1 flex-col py-2.5 text-left"
        >
          <span className="flex min-w-0 items-baseline">
            <span
              data-row-title
              className={`truncate ${t.status === 'in_progress' ? 'font-semibold' : ''}`}
            >
              {t.title}
            </span>
            {saved && <SavedMark />}
          </span>
          <RowMeta breadcrumb={taskCrumb(t)} blocked={blockedLabel(t.blockedBy)} />
        </button>
        {hints.due?.late && <RowNote tone="text-missed">{hints.due.late}</RowNote>}
        {carried && (
          <span
            data-date-hint="carried"
            className="shrink-0 pt-2.5 pl-3 text-sm leading-6 whitespace-nowrap text-plan max-sm:hidden"
          >
            Carried over from {carriedFrom}
          </span>
        )}
        <span className="flex h-11 shrink-0 items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <StartButton
            status={t.status}
            title={t.title}
            onClick={() => onStatus(toggleStartTarget(t.status))}
          />
          {sections && (
            <TriageControl
              groupLabel={
                t.segment === 'overdue' ? `Overdue: ${t.title}` : `Carried over: ${t.title}`
              }
              triggerLabel={`Change the dates for “${t.title}”`}
              sections={sections}
              onRan={onRan}
            />
          )}
        </span>
      </div>
    </li>
  )
}

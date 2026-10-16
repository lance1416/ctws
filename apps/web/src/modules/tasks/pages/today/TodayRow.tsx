import { type TaskStatus, type TodayTaskResponse, type TaskId } from '@ctws/contracts'
import type { KeyboardEvent } from 'react'
import { leadFor, ProjectRail, RowLead } from '../../../../shell/rows'
import { toggleDoneTarget, toggleStartTarget } from '../../api/taskActions'
import { blockedLabel } from '../../blockedLabel'
import { StartButton, StatusButton } from '../../components/StatusControls'
import { opensOnClick, RowMeta, RowNote, SavedMark } from '../../components/TaskRowParts'
import { TriageControl } from '../../components/TriageControl'
import { taskCrumb } from '../../crumb'
import { lateNote } from '../../dueDates'
import { triageSections, type TriagePatch } from '../../triage'

/** A task row on Today. Its controls wait for the pointer or keyboard, except without hover. */
export function TodayRow({
  task: t,
  anyTime,
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
  anyTime: boolean
  today: string
  timeZone: string
  now: Date
  saved: boolean
  onOpen: () => void
  onKeyDown: (e: KeyboardEvent) => void
  onStatus: (status: TaskStatus) => void
  onPatch: (id: TaskId, body: TriagePatch) => void
  /** A triage action ran; its menu is gone, so focus needs somewhere to go. */
  onRan: () => void
}) {
  const late = lateNote(t, timeZone, now)
  // A plan for a day already gone, still not done: carried over, and said so on the right.
  const carried = t.segment === 'today' && t.scheduledOn !== null && t.scheduledOn < today
  const sections = triageSections(t, carried, today, timeZone, onPatch)
  const lead =
    leadFor(
      // A plan for today, or a carried one, leaves the margin to the line's times; a carried
      // plan's first day is said on the right.
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
        // Blocked rows dim but stay: a list that loses tasks cannot be trusted.
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
        {late && <RowNote>{late}</RowNote>}
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

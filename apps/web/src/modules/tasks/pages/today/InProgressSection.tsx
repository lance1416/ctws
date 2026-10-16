import { type TaskStatus, type TodayTaskResponse, type TaskId } from '@ctws/contracts'
import type { KeyboardEvent, ReactNode } from 'react'
import { Button } from '../../../../platform/ui/Button'
import {
  DayEmpty,
  DaySection,
  leadFor,
  ProjectRail,
  ROW_BODY_WIDE,
  ROW_LIST,
  RowLead,
} from '../../../../shell/rows'
import { toggleDoneTarget, toggleStartTarget } from '../../logic/status'
import { StatusButton } from '../../components/StatusControls'
import { StatusMark } from '../../components/StatusMark'
import { opensOnClick, OVER_ROW, SavedMark } from '../../components/TaskRowParts'
import { taskCrumb } from '../../logic/crumb'
import { useTimeZone } from '../../../../shell/auth'

type RowProps = {
  task: TodayTaskResponse
  today: string
  saved: boolean
  /** The title button's ref: the row's focus carrier. */
  rowRef: (el: HTMLElement | null) => () => void
  onOpen: () => void
  onKeyDown: (e: KeyboardEvent) => void
  onStatus: (status: TaskStatus) => void
}

/**
 * One task in progress is the focal point, in large type with Done and Pause beside it; several
 * step down to rows.
 */
export function InProgressSection({
  tasks,
  today,
  savedId,
  rowRef,
  onOpen,
  onKeyDown,
  onStatus,
}: {
  tasks: readonly TodayTaskResponse[]
  today: string
  savedId: string | null
  /** Each title button's ref: the row's focus carrier. */
  rowRef: (id: TaskId) => (el: HTMLElement | null) => () => void
  onOpen: (id: TaskId) => void
  onKeyDown: (e: KeyboardEvent, t: TodayTaskResponse) => void
  onStatus: (id: TaskId, status: TaskStatus) => void
}) {
  const Row = tasks.length === 1 ? FocalRow : DoingRow
  return (
    <DaySection label="In progress" count={tasks.length === 1 ? undefined : tasks.length}>
      {tasks.length === 0 ? (
        <DayEmpty>Nothing in progress</DayEmpty>
      ) : (
        <ul className={ROW_LIST}>
          {tasks.map((t) => (
            <Row
              key={t.id}
              task={t}
              today={today}
              saved={savedId === t.id}
              rowRef={rowRef(t.id)}
              onOpen={() => onOpen(t.id)}
              onKeyDown={(e) => onKeyDown(e, t)}
              onStatus={(status) => onStatus(t.id, status)}
            />
          ))}
        </ul>
      )}
    </DaySection>
  )
}

/** The one task in progress: its title in full, in large type, with Done and Pause beside it. */
function FocalRow({ task: t, today, saved, rowRef, onOpen, onKeyDown, onStatus }: RowProps) {
  return (
    <Row task={t} today={today} onOpen={onOpen} body="flex-wrap gap-y-2 py-2">
      <span className="flex h-11 shrink-0 items-center">
        <StatusMark status={t.status} />
      </span>
      <button
        type="button"
        ref={rowRef}
        data-today-row={t.id}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        // At least 12rem, so Done and Pause wrap under a short title rather than squeeze it.
        className="flex min-w-[min(12rem,100%)] flex-1 flex-col text-left"
      >
        <span className="flex min-w-0 items-baseline">
          <span
            data-doing-title
            // In full, on as many lines as it takes.
            className="min-w-0 text-2xl font-semibold [overflow-wrap:anywhere] max-sm:text-xl"
          >
            {t.title}
          </span>
          {saved && <SavedMark />}
        </span>
        <span className="truncate text-sm text-ink-muted">{taskCrumb(t)}</span>
      </button>
      {/* The visible word is in the accessible name: "Done" in “Complete “Title””. */}
      <span className="flex shrink-0 items-center gap-2 self-center">
        <Button
          look="primary"
          aria-label={`Complete “${t.title}”`}
          onClick={() => onStatus(toggleDoneTarget(t.status))}
        >
          Done
        </Button>
        <Pause task={t} onStatus={onStatus} />
      </span>
    </Row>
  )
}

/** One of several tasks in progress, as a row: its mark is the Done control. */
function DoingRow({ task: t, today, saved, rowRef, onOpen, onKeyDown, onStatus }: RowProps) {
  return (
    <Row task={t} today={today} onOpen={onOpen} body="min-h-11">
      {/* On a touch screen the mark is the only Done control. */}
      <span className="flex h-11 shrink-0 items-center">
        <StatusButton
          status={t.status}
          title={t.title}
          onClick={() => onStatus(toggleDoneTarget(t.status))}
        />
      </span>
      <button
        type="button"
        ref={rowRef}
        data-today-row={t.id}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        className="flex min-w-0 flex-1 flex-col py-2.5 text-left"
      >
        <span className="flex min-w-0 items-baseline">
          <span data-doing-title className="truncate text-base font-semibold">
            {t.title}
          </span>
          {saved && <SavedMark />}
        </span>
        <span className="truncate text-sm text-ink-muted">{taskCrumb(t)}</span>
      </button>
      {/* Over the row, not in it: it takes no width from the title. The mark is already Done,
          so a second Done is not drawn. */}
      <span
        className={`absolute top-0 right-1 flex h-11 shrink-0 items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:hidden ${OVER_ROW}`}
      >
        <Pause task={t} onStatus={onStatus} />
      </span>
    </Row>
  )
}

/** The parts both rows share: the margin, the thread, and a body that opens the task on a click. */
function Row({
  task: t,
  today,
  onOpen,
  body,
  children,
}: Pick<RowProps, 'task' | 'today' | 'onOpen'> & {
  body: string
  children: ReactNode
}) {
  // The server files a task planned up to today under Today, so any plan here is later.
  const lead = leadFor(t, today, useTimeZone())
  return (
    <li
      onClick={(e) => {
        if (opensOnClick(e)) onOpen()
      }}
      className="group flex cursor-pointer items-stretch"
    >
      <RowLead lead={lead} />
      <ProjectRail projectId={t.projectId} />
      <div
        className={`${ROW_BODY_WIDE} relative items-start gap-x-2.5 pr-2 group-hover:bg-hover ${body}`}
      >
        {children}
      </div>
    </li>
  )
}

function Pause({ task: t, onStatus }: Pick<RowProps, 'task' | 'onStatus'>) {
  return (
    <Button
      look="secondary"
      aria-label={`Pause “${t.title}”`}
      onClick={() => onStatus(toggleStartTarget(t.status))}
    >
      Pause
    </Button>
  )
}

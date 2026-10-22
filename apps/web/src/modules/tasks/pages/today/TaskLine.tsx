import type { TaskId, TaskStatus, TodayTaskResponse } from '@ctws/contracts'
import type { KeyboardEvent, ReactNode } from 'react'
import { ICON_BUTTON } from '../../../../platform/ui/buttonStyles'
import { DoneIcon, FlagIcon } from '../../../../platform/ui/icons'
import { ProjectSquare, useEveryProject } from '../../../../shell/projects'
import { ProgressSquare } from '../../components/ProgressSquare'
import { StatusButton } from '../../components/StatusControls'
import { SavedMark } from '../../components/TaskRowParts'
import { blockedLabel } from '../../logic/blockedLabel'
import { toggleDoneTarget } from '../../logic/status'
import { dueMark } from '../../logic/todayMarks'

/**
 * THE COLUMNS EVERY LIST ON TODAY SHARES (DES-001 section 4, artboard 12): status, title, where it
 * sits, its mark, and what can be done about it. A row without one of them leaves that cell empty;
 * nothing moves left. Below the desk width the path and the mark give way to the title.
 */
export const LINE =
  'grid min-h-9.5 grid-cols-[16px_minmax(0,1fr)_184px_104px_220px] items-center gap-x-3 rounded-control px-3 hover:bg-hover max-lg:grid-cols-[16px_minmax(0,1fr)_auto]'

/** The third column: the project's square and the task it sits under, else the project's name. */
export function TaskPath({
  task,
}: {
  task: Pick<TodayTaskResponse, 'projectId' | 'projectName' | 'parentTitle'>
}) {
  const projects = useEveryProject()
  const project = projects.data?.find((p) => p.id === task.projectId)
  return (
    <span
      data-row-path
      className="inline-flex min-w-0 items-center gap-1.5 text-ui text-muted max-lg:hidden"
    >
      {project && (
        <span data-project-square={project.id} className="contents">
          <ProjectSquare project={project} />
        </span>
      )}
      <span className="truncate">{task.parentTitle ?? task.projectName}</span>
    </span>
  )
}

const MARK_TONE = {
  today: 'bg-warn-bg text-warn-t',
  soon: 'bg-hover text-muted',
  late: 'bg-stop-bg text-stop-t',
} as const

/** The fourth column: when it is due (FR-079), a chip; empty when it is due on no day. */
function DueChip({
  dueAt,
  today,
  timeZone,
}: {
  dueAt: string | null
  today: string
  timeZone: string
}) {
  const mark = dueMark(dueAt, today, timeZone)
  if (!mark) return <span className="max-lg:hidden" />
  return (
    <span
      data-row-mark
      className={`inline-flex h-5.5 items-center gap-1 justify-self-start rounded-control px-2 text-meta font-medium whitespace-nowrap max-lg:hidden ${MARK_TONE[mark.tone]}`}
    >
      {mark.tone !== 'late' && <FlagIcon size={12} aria-hidden="true" />}
      {mark.text}
    </span>
  )
}

/**
 * One task on Today, in the shared columns; `action` is the fifth. A parent (FR-043) has its
 * progress where a leaf has its status, and how many of its children are done where a leaf has
 * its action: its status and its plan are its children's to change (artboard 32).
 */
export function TaskLine({
  task: t,
  today,
  timeZone,
  saved,
  rowRef,
  onOpen,
  onKeyDown,
  onStatus,
  action,
}: {
  task: TodayTaskResponse
  today: string
  timeZone: string
  saved: boolean
  /** The title button's ref: the row's focus carrier. */
  rowRef: (el: HTMLElement | null) => () => void
  onOpen: () => void
  onKeyDown: (e: KeyboardEvent) => void
  onStatus: (status: TaskStatus) => void
  action: ReactNode
}) {
  const blocked = blockedLabel(t.blockedBy)
  return (
    // Blocked rows dim but stay: a list that loses tasks cannot be trusted.
    <li className={`${LINE} ${blocked ? 'opacity-60' : ''}`}>
      {t.children ? (
        <ProgressSquare status={t.status} children={t.children} />
      ) : (
        <span className="-m-1.5 flex">
          <StatusButton
            status={t.status}
            title={t.title}
            size={16}
            onClick={() => onStatus(toggleDoneTarget(t.status))}
          />
        </span>
      )}
      <button
        type="button"
        ref={rowRef}
        data-today-row={t.id}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        title={blocked ?? undefined}
        className={`flex min-w-0 items-baseline text-left text-ui text-ink ${
          t.status === 'in_progress' ? 'font-medium' : ''
        }`}
      >
        <span data-row-title className="truncate">
          {t.title}
        </span>
        {saved && <SavedMark />}
        {blocked && <span className="sr-only">, {blocked}</span>}
      </button>
      <TaskPath task={t} />
      <DueChip dueAt={t.dueAt} today={today} timeZone={timeZone} />
      <span className="justify-self-end">
        {t.children ? (
          <span data-row-children className="font-mono text-meta text-subtle tabular-nums">
            {t.children.done}/{t.children.counted}
          </span>
        ) : (
          action
        )}
      </span>
    </li>
  )
}

/** In progress's fifth column: finish it. */
export function DoneButton({
  id,
  title,
  onDone,
}: {
  id: TaskId
  title: string
  onDone: () => void
}) {
  return (
    <button
      type="button"
      data-done-button={id}
      onClick={onDone}
      aria-label={`Mark “${title}” done`}
      className={ICON_BUTTON}
    >
      <DoneIcon size={16} aria-hidden="true" />
    </button>
  )
}

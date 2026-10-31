import type { ProjectId, ProjectResponse, TaskId } from '@ctws/contracts'
import { useState, type ReactNode, type RefObject } from 'react'
import { radioKeys } from '../../platform/ui/choiceKeys'
import { BottomSheet } from '../../platform/ui/BottomSheet'
import { BUTTON } from '../../platform/ui/buttonStyles'
import { InboxIcon, KIND_ICON, PLACE_ICON } from '../../platform/ui/icons'
import { dayPhrase } from '../../platform/time/dates'
import { DayGrid, monthOf } from '../dates/grids'
import { MoveToProject } from '../projects/MoveToProject'
import { ProjectSquare } from '../projects/ProjectSquare'
import { ReadingImports } from './ReadingImports'

type Kind = 'task' | 'reading'

/** Where a line lands, as the sheet holds it: a project, and a task in it when one was picked. */
export type Landing = { projectId: ProjectId | null; parent: { id: TaskId; title: string } | null }

/**
 * THE CAPTURE SHEET (FR-084, artboard 25): the capture box on a phone, from the tab bar's middle
 * button. The same rules as the desk's (FR-025); where it lands is Move to… full screen, Inbox
 * first, a project's parents a step in; the day is the shared picker, from the foot. Add keeps it
 * open and empty for the next line.
 */
export function CaptureSheet({
  box,
  text,
  setText,
  kind,
  setKind,
  landing,
  setLanding,
  landingName,
  inbox,
  projects,
  date,
  setDate,
  today,
  canAdd,
  onAdd,
  onClose,
  status,
}: {
  box: RefObject<HTMLTextAreaElement | null>
  text: string
  setText: (text: string) => void
  kind: Kind
  setKind: (kind: Kind) => void
  landing: Landing
  setLanding: (landing: Landing) => void
  /** Where it lands when no project is picked ("Inbox", "To read"). */
  landingName: string
  inbox: ProjectResponse | undefined
  projects: readonly ProjectResponse[]
  date: string | null
  setDate: (date: string | null) => void
  today: string
  canAdd: boolean
  onAdd: () => void
  onClose: () => void
  /** What was said about the last line, and why nothing can be added. */
  status: ReactNode
}) {
  const [where, setWhere] = useState(false)
  const [picking, setPicking] = useState(false)
  const [month, setMonth] = useState(monthOf(date ?? today))
  const [soon, setSoon] = useState(false)
  const project = landing.projectId ? projects.find((p) => p.id === landing.projectId) : undefined
  const chip =
    'inline-flex h-11 min-w-0 items-center gap-1.5 rounded-control px-2.5 text-ui font-medium'
  return (
    <BottomSheet title="Capture" onClose={onClose} initialFocus={box}>
      <div className="flex flex-col gap-3 px-4 pt-1 pb-4">
        <textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          aria-label="Capture"
          placeholder="A thought, or a link"
          className="min-h-24 resize-none rounded-card border border-line-strong bg-panel px-3 py-2.5 text-prose text-ink placeholder:text-subtle"
        />
        <div
          role="radiogroup"
          onKeyDown={radioKeys}
          aria-label="Kind"
          className="grid grid-cols-3 rounded-card bg-hover p-0.5"
        >
          <Segment on={kind === 'task'} onClick={() => setKind('task')} icon={KIND_ICON.task}>
            Task
          </Segment>
          <Segment
            on={kind === 'reading'}
            onClick={() => setKind('reading')}
            icon={KIND_ICON.reading}
          >
            Reading
          </Segment>
          {/* A placeholder (FR-089): it can be pressed, and says so. */}
          <Segment on={false} soon onClick={() => setSoon(true)} icon={KIND_ICON.meeting}>
            Event
          </Segment>
        </div>
        {soon && (
          <p role="status" className="text-ui text-muted">
            Coming later
          </p>
        )}
        {kind === 'reading' && <ReadingImports />}
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-ui whitespace-nowrap text-subtle">Lands in</span>
          <button
            type="button"
            onClick={() => setWhere(true)}
            aria-label={`Lands in ${project?.name ?? landingName}${landing.parent ? `, under ${landing.parent.title}` : ''}`}
            className={`${chip} ${kind === 'reading' && !project ? 'bg-reading-bg text-reading-t' : 'bg-project-bg text-project-t'}`}
          >
            {project ? (
              <ProjectSquare project={project} />
            ) : kind === 'task' ? (
              <InboxIcon size={14} aria-hidden="true" className="shrink-0" />
            ) : (
              <KIND_ICON.reading size={14} aria-hidden="true" className="shrink-0" />
            )}
            <span className="truncate">
              {landing.parent ? landing.parent.title : (project?.name ?? landingName)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={date ? `On ${dayPhrase(date, today)}` : 'No date'}
            className={`${chip} shrink-0 ${date ? 'bg-task-bg text-task-t' : 'bg-hover text-muted'}`}
          >
            <PLACE_ICON.calendar size={14} aria-hidden="true" />
            {date ? dayPhrase(date, today) : 'No date'}
          </button>
          <span aria-hidden="true" className="flex-1" />
          <button
            type="button"
            onClick={onAdd}
            disabled={!canAdd}
            className={`${BUTTON.primary} h-11 shrink-0 px-5`}
          >
            Add
          </button>
        </div>
        {status}
      </div>

      {where && (
        <MoveToProject
          of={null}
          title="Lands in"
          first={inbox?.id ?? null}
          busy={false}
          error={null}
          onPick={(to) => {
            setLanding({ projectId: to === inbox?.id ? null : to, parent: null })
            setWhere(false)
          }}
          // A task can land under one of a project's tasks; a reading cannot.
          {...(kind === 'task'
            ? {
                onPickParent: ({ project: there, parent }) => {
                  setLanding({ projectId: there.id, parent })
                  setWhere(false)
                },
              }
            : {})}
          onClose={() => setWhere(false)}
        />
      )}
      {picking && (
        <BottomSheet title="Day" onClose={() => setPicking(false)}>
          <div className="flex flex-col gap-3 px-3 pb-4">
            <DayGrid
              month={month}
              setMonth={setMonth}
              value={date}
              today={today}
              onPick={(day) => {
                setDate(day)
                setPicking(false)
              }}
            />
            {date && (
              <button
                type="button"
                onClick={() => {
                  setDate(null)
                  setPicking(false)
                }}
                className={`${BUTTON.secondary} h-11`}
              >
                No date
              </button>
            )}
          </div>
        </BottomSheet>
      )}
    </BottomSheet>
  )
}

function Segment({
  on,
  soon = false,
  onClick,
  icon: Icon,
  children,
}: {
  on: boolean
  soon?: boolean
  onClick: () => void
  icon: (typeof KIND_ICON)[keyof typeof KIND_ICON]
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      tabIndex={on ? 0 : -1}
      onClick={onClick}
      className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-control text-ui font-medium ${
        on ? 'bg-panel text-ink ring-1 ring-line' : soon ? 'text-subtle opacity-60' : 'text-muted'
      }`}
    >
      <Icon size={16} aria-hidden="true" />
      {children}
    </button>
  )
}

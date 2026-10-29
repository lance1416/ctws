import type { ProjectId, ReviewResponse, TaskStatus } from '@ctws/contracts'
import { usePhone } from '../../../platform/ui/phone'
import { addDays } from '@ctws/core/day'
import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import {
  BackIcon,
  ByStageIcon,
  CollapseIcon,
  ExpandIcon,
  ForwardIcon,
  InTouchIcon,
} from '../../../platform/ui/icons'
import { StageLabel } from '../../../platform/ui/StageLabel'
import { useProjects, ProjectSquare, useEveryProject } from '../../../shell/projects'
import { OpensBeside } from '../../../shell/inspector'
import { useAlsoThisWeek } from '../../../shell/review'
import { reviewQuery } from '../api'
import { StatusMark } from '../../../platform/ui/StatusMark'
import { useReviewWeek } from '../hooks/useReviewWeek'
import { cellLines, type CellLine } from '../logic/review'
import { Completed } from './Completed'

/** Lines a cell shows before the rest fold into "N more". */
const PER_CELL = 5

const LANES = [
  { list: 'finished', label: 'Finished', status: 'done' },
  { list: 'started', label: 'Started', status: 'in_progress' },
  { list: 'dropped', label: 'Dropped', status: 'cancelled' },
] as const satisfies readonly { list: string; label: string; status: TaskStatus }[]

type ReviewProject = ReviewResponse['projects'][number]

const LANE_GRID = 'grid grid-cols-[168px_repeat(3,minmax(0,1fr))] gap-x-4 px-3.5'

/** "Week of October 12". */
const weekTitle = (monday: string) =>
  `Week of ${new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${monday}T12:00:00Z`))}`

/**
 * THE WEEKLY REVIEW (FR-081, artboard 19): what each project finished, started and dropped in a
 * week, read from the change log; the leaves of one parent as one line; the projects with no
 * movement together at the end. Beside it, the stages that moved and what else the week held.
 * The weeks to choose from are in the sidebar.
 */
export function Review() {
  const [params] = useSearchParams()
  if (params.get('view') === 'done')
    return (
      <>
        <h1 className="text-title text-ink">Done</h1>
        <Completed />
      </>
    )
  return <Week />
}

function Week() {
  const phone = usePhone()
  const { monday, thisMonday, show } = useReviewWeek()
  const review = useQuery(reviewQuery({ from: monday, to: addDays(monday, 6) }))
  const data = review.data
  const live = useProjects()
  const total = data?.projects.reduce((n, p) => n + p.finished.length, 0) ?? 0
  const moved = new Set(data?.projects.map((p) => p.projectId))
  const still = (live.data ?? []).filter((p) => !p.isInbox && !moved.has(p.id))

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3.5">
        <button
          type="button"
          aria-label="Previous week"
          onClick={() => show(addDays(monday, -7))}
          className={ICON_BUTTON}
        >
          <BackIcon size={16} aria-hidden="true" />
        </button>
        <h1 className="text-title text-ink">{weekTitle(monday)}</h1>
        <button
          type="button"
          aria-label="Next week"
          disabled={monday >= thisMonday}
          onClick={() => show(addDays(monday, 7))}
          className={`${ICON_BUTTON} disabled:opacity-30`}
        >
          <ForwardIcon size={16} aria-hidden="true" />
        </button>
        {data && (
          <p data-review-total className="ml-auto flex items-center gap-2">
            <span className="text-hero tracking-[-0.02em] text-ink tabular-nums">{total}</span>
            {/* Two lines beside the number, however short the words (RV-02). */}
            <span className="flex w-[70px] flex-col text-ui text-muted">
              <span>finished</span>
              <span>{monday === thisMonday ? 'so far' : 'this week'}</span>
            </span>
          </p>
        )}
      </div>

      {review.isError && (
        <p role="alert" className="text-ui text-stop-t">
          Couldn't load the review
        </p>
      )}

      {data && phone && (
        <div className="flex flex-col gap-3">
          {data.projects.map((p) => (
            <PhoneLane key={p.projectId} project={p} />
          ))}
          {data.projects.length === 0 && (
            <p className="px-1 text-ui text-subtle">Nothing happened this week</p>
          )}
          <Brief stages={data.stagesMoved} range={{ from: data.from, to: data.to }} />
          {still.length > 0 && (
            <section
              aria-label="No movement"
              data-no-movement
              className="flex flex-col gap-2 rounded-phone-card border border-line bg-panel p-3.5"
            >
              <h2 className="text-ui font-medium text-muted">No movement</h2>
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {still.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-ui text-ink">
                    <ProjectSquare project={p} />
                    {p.name}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {data && !phone && (
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section
            aria-label="By project"
            className="overflow-x-auto rounded-card border border-line bg-panel"
          >
            <div className="min-w-[640px]">
              <div className={`${LANE_GRID} h-10 items-center border-b border-line`}>
                <span className="text-meta font-medium text-muted">Project</span>
                {LANES.map(({ list, label, status }) => (
                  <span
                    key={list}
                    className="flex items-center gap-1.5 text-ui font-medium text-ink"
                  >
                    <StatusMark status={status} size={14} />
                    {label}
                    <span className="text-meta font-normal text-muted tabular-nums">
                      {data.projects.reduce((n, p) => n + p[list].length, 0)}
                    </span>
                  </span>
                ))}
              </div>
              {data.projects.map((p) => (
                <Lane key={p.projectId} project={p} />
              ))}
              {data.projects.length === 0 && (
                <p className="px-3.5 py-3 text-ui text-subtle">Nothing happened this week</p>
              )}
              {still.length > 0 && (
                <div
                  data-no-movement
                  className={`${LANE_GRID} items-center border-t border-line py-3 first:border-t-0`}
                >
                  <span className="text-meta font-medium text-muted">No movement</span>
                  <ul className="col-span-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {still.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 text-ui text-ink">
                        <ProjectSquare project={p} />
                        {p.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
          <Brief stages={data.stagesMoved} range={{ from: data.from, to: data.to }} />
        </div>
      )}
    </div>
  )
}

/**
 * A project's week on a phone (DES-001 "回顾"): a card, its square and name on top, then what was
 * finished, started and dropped, a section each and only where there is some, five rows a section.
 */
function PhoneLane({ project: p }: { project: ReviewProject }) {
  const project = useEveryProject().data?.find((x) => x.id === p.projectId)
  const closed = new Set(p.closedParents.map((c) => c.id))
  return (
    <section
      aria-label={p.projectName}
      data-review-lane={p.projectName}
      className="flex flex-col gap-3 rounded-phone-card border border-line bg-panel p-3.5"
    >
      <h2 className="flex items-center gap-2 text-prose font-medium text-ink">
        {project && <ProjectSquare project={project} />}
        <span className="min-w-0 truncate">{p.projectName}</span>
      </h2>
      {LANES.filter(({ list }) => p[list].length > 0).map(({ list, label, status }) => (
        <div key={list} className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-1.5 text-ui font-medium text-muted">
            <StatusMark status={status} size={14} />
            {label}
            <span className="font-normal tabular-nums">{p[list].length}</span>
          </h3>
          <Cell
            lines={cellLines(p[list], closed)}
            status={status}
            projectId={p.projectId}
            label={list}
          />
        </div>
      ))}
    </section>
  )
}

/** One project's row: its square and name, then a cell for each of the three lists. */
function Lane({ project: p }: { project: ReviewProject }) {
  const every = useEveryProject()
  const project = every.data?.find((x) => x.id === p.projectId)
  const closed = new Set(p.closedParents.map((c) => c.id))
  return (
    <div
      data-review-lane={p.projectName}
      className={`${LANE_GRID} border-t border-line py-3 first:border-t-0`}
    >
      <span className="flex items-center gap-2 self-start text-ui font-medium text-ink">
        {project && <ProjectSquare project={project} />}
        <span className="min-w-0 truncate">{p.projectName}</span>
      </span>
      {LANES.map(({ list, status }) => (
        <Cell
          key={list}
          lines={cellLines(p[list], closed)}
          status={status}
          projectId={p.projectId}
          label={list}
        />
      ))}
    </div>
  )
}

function Cell({
  lines,
  status,
  projectId,
  label,
}: {
  lines: CellLine[]
  status: TaskStatus
  projectId: ProjectId
  label: string
}) {
  const [all, setAll] = useState(false)
  const shown = all ? lines : lines.slice(0, PER_CELL)
  return (
    <ul data-review-cell={label} className="flex min-w-0 flex-col gap-1">
      {shown.map((line) =>
        line.kind === 'task' ? (
          <li key={line.task.id}>
            <Item id={line.task.id} title={line.task.title} status={status} projectId={projectId} />
          </li>
        ) : (
          <Parent key={line.parent.id} line={line} status={status} projectId={projectId} />
        ),
      )}
      {lines.length > shown.length && (
        <li>
          <button
            type="button"
            onClick={() => setAll(true)}
            className="pl-6 text-meta text-muted hover:text-ink"
          >
            {`${lines.length - shown.length} more`}
          </button>
        </li>
      )}
    </ul>
  )
}

/** A task as the review tells it: its mark, its name to open it; a dropped one struck through. */
function Item({
  id,
  title,
  status,
  projectId,
}: {
  id: string
  title: string
  status: TaskStatus
  projectId: ProjectId
}) {
  const dropped = status === 'cancelled'
  return (
    <span className="grid min-h-6 grid-cols-[16px_minmax(0,1fr)] items-start gap-x-2">
      <span className="flex h-5 items-center">
        <StatusMark status={status} size={14} />
      </span>
      {/* In the inspector, the review staying put (FR-022, DES-001 "回顾"). */}
      <OpensBeside
        thing={{ type: 'task', id }}
        to={`/projects/${projectId}?task=${id}`}
        className={`text-left text-ui hover:underline ${dropped ? 'text-subtle line-through' : 'text-ink'}`}
      >
        {title}
      </OpensBeside>
    </span>
  )
}

/** The leaves of one parent as one line, its name and how many; opened, the leaves under it. */
function Parent({
  line,
  status,
  projectId,
}: {
  line: Extract<CellLine, { kind: 'parent' }>
  status: TaskStatus
  projectId: ProjectId
}) {
  const [open, setOpen] = useState(false)
  const Toggle = open ? ExpandIcon : CollapseIcon
  return (
    <li className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid min-h-6 grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-x-2 text-left"
      >
        <span className="flex h-5 items-center text-muted">
          <Toggle size={14} aria-hidden="true" />
        </span>
        <span className="text-ui font-medium text-ink">{line.parent.title}</span>
        <span className="inline-flex h-5 items-center rounded-key bg-go-bg px-2 text-meta font-medium text-go-t tabular-nums">
          {line.tasks.length}
        </span>
      </button>
      {open && (
        <ul className="flex flex-col gap-1 pl-6">
          {line.tasks.map((t) => (
            <li key={t.id}>
              <Item id={t.id} title={t.title} status={status} projectId={projectId} />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** The panel beside the table, one block with no rules: the stages that moved, and the rest. */
function Brief({
  stages,
  range,
}: {
  stages: ReviewResponse['stagesMoved']
  range: { from: string; to: string }
}) {
  const every = useEveryProject()
  const also = useAlsoThisWeek(range)
  return (
    <aside
      aria-label="This week in brief"
      className="flex flex-col rounded-card border border-line bg-panel pb-2"
    >
      <BriefSection
        icon={<ByStageIcon size={16} aria-hidden="true" />}
        title="Stages moved"
        count={stages.length}
      >
        {stages.map((s) => {
          const project = every.data?.find((p) => p.id === s.projectId)
          return (
            <li
              key={`${s.taskId}:${s.at}`}
              className="flex min-h-8 items-center gap-2.5 px-3.5 text-ui text-ink"
            >
              {project && <ProjectSquare project={project} />}
              <OpensBeside
                thing={{ type: 'task', id: s.taskId }}
                to={`/projects/${s.projectId}?task=${s.taskId}`}
                className="min-w-0 flex-1 truncate hover:underline"
              >
                {s.title}
              </OpensBeside>
              <StageLabel name={s.to} quiet={false} />
            </li>
          )
        })}
      </BriefSection>
      <BriefSection icon={<InTouchIcon size={16} aria-hidden="true" />} title="Also this week">
        {also.isError && (
          <li className="px-3.5 text-ui text-stop-t">
            Couldn't count them{' '}
            <button type="button" onClick={also.retry} className="text-ink underline">
              Try again
            </button>
          </li>
        )}
        {also.rows?.map(({ key, label, icon: Icon, count }) => (
          <li
            key={key}
            data-also={key}
            className="grid min-h-8 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-2.5 px-3.5 text-ui text-ink"
          >
            <Icon size={16} aria-hidden="true" className="text-muted" />
            {label}
            <span className="tabular-nums">{count}</span>
          </li>
        ))}
      </BriefSection>
    </aside>
  )
}

function BriefSection({
  icon,
  title,
  count,
  children,
}: {
  icon: ReactNode
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="pt-1">
      <h2 className="flex h-10 items-center gap-2 px-3.5 text-ui font-medium text-ink">
        <span className="text-muted">{icon}</span>
        {title}
        {count !== undefined && (
          <span className="text-meta font-normal text-muted tabular-nums">{count}</span>
        )}
      </h2>
      <ul className="flex flex-col pb-1.5">{children}</ul>
    </section>
  )
}

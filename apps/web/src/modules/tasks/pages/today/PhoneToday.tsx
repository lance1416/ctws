import type { TaskId, TodayTaskResponse } from '@ctws/contracts'
import { addDays } from '@ctws/core/day'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { longDay, ymd } from '../../../../platform/time/dates'
import { useNow } from '../../../../platform/time/useNow'
import { BottomSheet } from '../../../../platform/ui/BottomSheet'
import { BlockFailed, SkeletonRows } from '../../../../platform/ui/Block'
import { ICON_BUTTON, SWIPE } from '../../../../platform/ui/buttonStyles'
import {
  CarriedIcon,
  DoneIcon,
  FlagIcon,
  InProgressIcon,
  PLACE_ICON,
} from '../../../../platform/ui/icons'
import { PhoneSection } from '../../../../platform/ui/PhoneSection'
import { StatusMark } from '../../../../platform/ui/StatusMark'
import { useTimeZone } from '../../../../shell/auth'
import { useLunarName } from '../../../../shell/calendar'
import { DayGrid, monthOf } from '../../../../shell/dates'
import { PhoneHead } from '../../../../shell/layout'
import { ProjectSquare, useEveryProject } from '../../../../shell/projects'
import { useRegistry } from '../../../../shell/registry'
import { SearchDialog } from '../../../../shell/search'
import { todayQuery } from '../../api'
import { ProgressSquare } from '../../components/ProgressSquare'
import { AllInInspector, useShowInInspector } from '../../../../shell/inspector'
import { ALL_ROW, TODAY_LISTS } from '../../components/TodayLists'
import { useTaskActions } from '../../hooks/useTaskActions'
import { carriedFrom, dueMark } from '../../logic/todayMarks'
import { todaySegments } from '../../logic/today'

/** How far a row slides left to show its two buttons, each 84 wide (artboard 25). */
const OPEN_PX = 168
/** How far a row is swiped right before letting go finishes it. */
const DONE_PX = 96

/** A block's rows before its "All N", as on the desk (FR-015, DES-001 section 4). */
const SHOWN = 5

/**
 * TODAY ON A PHONE (FR-083, artboard 25): the date and its lunar day, then a section a card for
 * what is in progress, planned for today and late, then what the modules add (follow-ups due,
 * birthdays near). No timeline, no Ready to start, no This week. The circle finishes a row; swiped
 * left it offers Tomorrow and Pick a date, swiped right it is done; its name opens it.
 */
export function PhoneToday() {
  const timeZone = useTimeZone()
  const day = ymd(useNow(), timeZone)
  const today = useQuery(todayQuery(day))
  const lunar = useLunarName(day)
  const registry = useRegistry()
  const [error, setError] = useState<string | null>(null)
  const actions = useTaskActions(setError)
  const [searching, setSearching] = useState(false)
  const [opened, setOpened] = useState<TaskId | null>(null)
  const [picking, setPicking] = useState<TodayTaskResponse | null>(null)
  // Its name opens it in the sheet over the page, a phone's inspector (DES-001).
  const inspect = useShowInInspector()
  const rows = today.data ?? []
  const { inProgress, planned, overdue } = todaySegments(rows)

  const row = (t: TodayTaskResponse) => (
    <PhoneTaskRow
      key={t.id}
      task={t}
      day={day}
      timeZone={timeZone}
      open={opened === t.id}
      setOpen={(open) => setOpened(open ? t.id : null)}
      onDone={() => actions.setStatus(t.id, 'done')}
      onTomorrow={() => actions.patch(t.id, { scheduledOn: addDays(day, 1) })}
      onPick={() => setPicking(t)}
      onOpen={() => inspect({ type: 'task', id: t.id })}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <PhoneHead
        title="Today"
        actions={
          <button
            type="button"
            onClick={() => setSearching(true)}
            aria-label="Search"
            className={`${ICON_BUTTON} size-11`}
          >
            <PLACE_ICON.search size={22} aria-hidden="true" />
          </button>
        }
      >
        <p className="flex items-center gap-2 text-prose text-muted">
          {longDay(day)}
          {lunar && (
            <span data-lunar-day className="text-ui">
              {lunar}
            </span>
          )}
        </p>
      </PhoneHead>

      {error && (
        <p role="alert" className="text-ui text-stop-t">
          {error}
        </p>
      )}
      {today.isError ? (
        <BlockFailed what="tasks for today" onRetry={() => void today.refetch()} />
      ) : today.isPending ? (
        <SkeletonRows rows={4} />
      ) : (
        <>
          {inProgress.length > 0 && (
            <PhoneSection
              icon={<InProgressIcon size={14} className="text-go" />}
              title="In progress"
              count={inProgress.length}
              foot={
                inProgress.length > SHOWN && (
                  <AllInInspector
                    list={TODAY_LISTS.inProgress}
                    count={inProgress.length}
                    className={ALL_ROW}
                  />
                )
              }
            >
              {inProgress.slice(0, SHOWN).map(row)}
            </PhoneSection>
          )}
          {planned.length > 0 && (
            <PhoneSection
              icon={<PLACE_ICON.calendar size={14} />}
              title="Planned for today"
              count={planned.length}
            >
              {planned.map(row)}
            </PhoneSection>
          )}
          {overdue.length > 0 && (
            <PhoneSection
              icon={<FlagIcon size={14} />}
              tone="text-stop-t"
              title="Overdue"
              count={overdue.length}
              foot={
                overdue.length > SHOWN && (
                  <AllInInspector
                    list={TODAY_LISTS.overdue}
                    count={overdue.length}
                    className={ALL_ROW}
                  />
                )
              }
            >
              {overdue.slice(0, SHOWN).map(row)}
            </PhoneSection>
          )}
          {inProgress.length + planned.length + overdue.length === 0 && (
            <p className="px-1 text-prose text-muted">Nothing planned for today.</p>
          )}
        </>
      )}
      {registry.todayBlocks.map(({ moduleId, id, Phone }) =>
        Phone ? <Phone key={`${moduleId}:${id}`} today={day} /> : null,
      )}

      {picking && (
        <PickADay
          task={picking}
          today={day}
          onPick={(to) => {
            // A plan, not a deadline: the deadline stays where it was (DES-001 "Pick a date").
            actions.patch(picking.id, { scheduledOn: to })
            setPicking(null)
            setOpened(null)
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {searching && <SearchDialog onClose={() => setSearching(false)} />}
    </div>
  )
}

/** The shared month grid from the foot, for the day a row moves to. */
function PickADay({
  task,
  today,
  onPick,
  onClose,
}: {
  task: TodayTaskResponse
  today: string
  onPick: (day: string) => void
  onClose: () => void
}) {
  const [month, setMonth] = useState(monthOf(today))
  return (
    <BottomSheet title="Move to" about={task.title} onClose={onClose}>
      <div className="px-3 pb-4">
        <DayGrid month={month} setMonth={setMonth} value={null} today={today} onPick={onPick} />
      </div>
    </BottomSheet>
  )
}

const MARK_TONE = {
  today: 'bg-warn-bg text-warn-t',
  soon: 'bg-warn-bg text-warn-t',
  late: 'bg-stop-bg text-stop-t',
} as const

/**
 * One task as a phone row: the circle (44 to touch), its name over the project's square and the
 * task it sits under, its deadline on the right. A parent wears its progress and is opened, not
 * finished or moved: those are its children's (FR-043).
 */
function PhoneTaskRow({
  task: t,
  day,
  timeZone,
  open,
  setOpen,
  onDone,
  onTomorrow,
  onPick,
  onOpen,
}: {
  task: TodayTaskResponse
  day: string
  timeZone: string
  open: boolean
  setOpen: (open: boolean) => void
  onDone: () => void
  onTomorrow: () => void
  onPick: () => void
  onOpen: () => void
}) {
  const projects = useEveryProject()
  const project = projects.data?.find((p) => p.id === t.projectId)
  const mark = dueMark(t.dueAt, day, timeZone)
  const carried = t.scheduledOn !== null && t.scheduledOn < day && t.segment === 'today'
  const leaf = t.children === null
  const swipe = useSwipe({ open, setOpen, onDone: leaf ? onDone : null })
  return (
    <li data-phone-row={t.id} className="relative overflow-hidden">
      {leaf && (
        // What a right swipe uncovers: it is done (the circle says the same to a screen reader).
        <div aria-hidden="true" className={`absolute inset-y-0 left-0 w-full ${SWIPE.done}`}>
          <DoneIcon size={16} />
          Done
        </div>
      )}
      <div
        {...swipe.bind}
        style={swipe.style}
        className="relative z-10 flex min-h-16 touch-pan-y items-center gap-1 bg-panel pr-3.5 transition-transform"
      >
        {leaf ? (
          <button
            type="button"
            onClick={onDone}
            aria-label={`Done “${t.title}”`}
            className="grid size-11 shrink-0 place-items-center"
          >
            <StatusMark status={t.status} size={20} />
          </button>
        ) : (
          <span className="grid size-11 shrink-0 place-items-center">
            <ProgressSquare status={t.status} children={t.children!} size={20} />
          </span>
        )}
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : onOpen())}
          className="flex min-w-0 flex-1 flex-col py-2.5 text-left"
        >
          <span className="truncate text-prose text-ink">{t.title}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-ui text-muted">
            {project && <ProjectSquare project={project} />}
            <span className="truncate">{t.parentTitle ?? t.projectName}</span>
            {carried && (
              <span
                data-date-hint="carried"
                className="inline-flex shrink-0 items-center gap-1 text-subtle"
              >
                <CarriedIcon size={12} aria-hidden="true" />
                {carriedFrom(t.scheduledOn!, day)}
              </span>
            )}
          </span>
        </button>
        {mark && (
          <span
            data-row-mark
            className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-control px-2 text-ui font-medium whitespace-nowrap ${MARK_TONE[mark.tone]}`}
          >
            {mark.tone !== 'late' && <FlagIcon size={12} aria-hidden="true" />}
            {mark.text}
          </span>
        )}
      </div>
      {leaf && (
        <div
          className="absolute inset-y-0 right-0 flex"
          // The swipe is a shortcut: a screen reader and a keyboard reach these as they are, and
          // reaching one slides the row open on it (DES-001 "滑动只是快捷方式").
          onFocus={() => setOpen(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
          }}
        >
          <button
            type="button"
            onClick={onTomorrow}
            aria-label={`Move “${t.title}” to tomorrow`}
            className={SWIPE.later}
          >
            <PLACE_ICON.calendar size={16} aria-hidden="true" />
            Tomorrow
          </button>
          <button
            type="button"
            onClick={onPick}
            aria-label={`Pick a date for “${t.title}”`}
            className={SWIPE.pick}
          >
            <PLACE_ICON.calendar size={16} aria-hidden="true" />
            Pick a date
          </button>
        </div>
      )}
    </li>
  )
}

/**
 * A row's sideways swipe: left past a third of its buttons and it stays open on them; right past
 * DONE_PX and it is done. A move more up than sideways is the page's scroll, not a swipe.
 */
function useSwipe({
  open,
  setOpen,
  onDone,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  onDone: (() => void) | null
}) {
  const start = useRef<{ x: number; y: number; sideways: boolean | null } | null>(null)
  const [dx, setDx] = useState<number | null>(null)
  const rest = open ? -OPEN_PX : 0
  const x = dx ?? rest
  return {
    style: { transform: `translateX(${x}px)`, transitionDuration: dx === null ? '150ms' : '0ms' },
    bind: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        start.current = { x: e.clientX, y: e.clientY, sideways: null }
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current
        if (!s) return
        const mx = e.clientX - s.x
        const my = e.clientY - s.y
        if (s.sideways === null && Math.hypot(mx, my) > 8) {
          s.sideways = Math.abs(mx) > Math.abs(my)
          if (s.sideways) e.currentTarget.setPointerCapture(e.pointerId)
        }
        if (!s.sideways) return
        const max = onDone ? DONE_PX + 24 : 0
        setDx(Math.max(-OPEN_PX - 24, Math.min(max, rest + mx)))
      },
      onPointerUp: () => {
        const s = start.current
        start.current = null
        if (!s?.sideways || dx === null) {
          setDx(null)
          return
        }
        if (onDone && dx > DONE_PX) onDone()
        else setOpen(dx < -OPEN_PX / 3)
        setDx(null)
      },
      onPointerCancel: () => {
        start.current = null
        setDx(null)
      },
      // A swipe's release is not a click on what it started on.
      onClickCapture: (e: React.MouseEvent) => {
        if (dx !== null) e.stopPropagation()
      },
    },
  }
}

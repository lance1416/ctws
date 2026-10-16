import { problemText } from '../../../platform/http/api'
import {
  taskId,
  idFrom,
  type TaskStatus,
  type TodayTaskResponse,
  type TaskId,
} from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type KeyboardEvent } from 'react'
import { useShortcutsEnabled } from '../../../platform/keyboard/enabled'
import { clockTime } from '@ctws/core/clock'
import { ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { HANG } from '../../../platform/ui/hang'
import { useTimeZone } from '../../../shell/auth'
import { useCrumbs } from '../../../shell/layout'
import { useRegistry } from '../../../shell/registry'
import { DayEmpty, DaySection, leadFor, ROW_LIST } from '../../../shell/rows'
import { completedQuery, movementQuery, todayQuery } from '../api'
import { useTaskActions } from '../hooks/useTaskActions'
import { DayLine, type DayItem } from '../components/DayLine'
import { DoneTodayPanel } from '../components/DoneTodayPanel'
import { MovementPanel } from '../components/MovementPanel'
import { statusForKey } from '../components/StatusControls'
import { TaskDetail } from '../components/TaskDetail'
import { useFocusAfterRemoval } from '../components/useFocusAfterRemoval'
import { useSavedFlash } from '../components/useSavedFlash'
import { TASKS_ID } from '../logic/id'
import { hasMovement } from '../logic/movement'
import { todaySegments } from '../logic/today'
import type { TriagePatch } from '../logic/triage'
import { DayHeading } from './today/DayHeading'
import { EntryRow } from './today/EntryRow'
import { InProgressSection } from './today/InProgressSection'
import { TodayRow } from './today/TodayRow'

/**
 * The day as one sheet: in progress, the day's line in time order, overdue, done today, and the
 * week beside them. The line holds every module's dated things; the server files each task.
 */
export function Today() {
  useCrumbs([{ label: 'Today' }])
  const today = useQuery(todayQuery())
  const completed = useQuery(completedQuery())
  const movement = useQuery(movementQuery())
  const timeZone = useTimeZone()
  // Kept current while the page sits open: the now line, the date and which day is today follow it.
  const now = useNow()
  const day = ymd(now, timeZone)
  // Other modules' dated things for today: one hook per provider, over the registry's fixed list.
  const entries = useRegistry()
    .calendar.filter((p) => p.moduleId !== TASKS_ID)
    .flatMap((p) =>
      p.useEntries({ from: day, to: day }).entries.map((e) => ({ ...e, moduleId: p.moduleId })),
    )
  const [openId, setOpenId] = useState<TaskId | null>(null)
  const rows = today.data ?? []
  const openTask = rows.find((t) => t.id === openId)

  const [error, setError] = useState<string | null>(null)
  const singleKeys = useShortcutsEnabled()
  const actions = useTaskActions(setError)
  const [savedId, setSavedId] = useSavedFlash()

  // A change, or the open pane, can take its row off this page; focus moves on in DOM order.
  const focus = useFocusAfterRemoval({
    ids: () =>
      [...document.querySelectorAll<HTMLElement>('[data-today-row]')].map((el) =>
        idFrom(taskId, el.dataset.todayRow!),
      ),
    rowFor: (id) => document.querySelector<HTMLElement>(`[data-today-row="${id}"]`),
    heading: () => document.getElementById('today-heading'),
    open: openId,
  })
  const setStatus = (id: TaskId, status: TaskStatus) => {
    setError(null)
    focus.expect(id)
    actions.setStatus(id, status, () => focus.drop(id))
  }
  const patch = (id: TaskId, body: TriagePatch) => {
    setError(null)
    focus.expect(id)
    actions.patch(id, body, () => focus.drop(id))
  }
  // A triage menu unmounts after its action, so focus goes back to the row; if the row then
  // leaves the page, `focus` moves it on again.
  const focusRow = (id: TaskId) =>
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-today-row="${id}"]`)?.focus())
  const onRowKeyDown = (e: KeyboardEvent, t: TodayTaskResponse) => {
    // `s` and `x` are single-key shortcuts, so they answer to the same off switch as `/` and `f`.
    const next = singleKeys ? statusForKey(e, t.status) : null
    if (!next) return
    e.preventDefault()
    setStatus(t.id, next)
  }

  const closeDetail = () => {
    const id = openId
    setOpenId(null)
    // After the pane unmounts, back to the row it was opened from.
    if (id) {
      queueMicrotask(() =>
        (
          document.querySelector<HTMLElement>(`[data-today-row="${id}"]`) ??
          document.querySelector<HTMLElement>('[data-today-row], #today-heading')
        )?.focus(),
      )
    }
  }

  // The pane unmounts without onClose when an edit takes its task off this page; `focus` has
  // already moved on to a neighbour.
  useEffect(() => {
    if (openId && today.isSuccess && !openTask) setOpenId(null)
  }, [openId, openTask, today.isSuccess])

  const taskRow = (t: TodayTaskResponse, anyTime = false) => (
    <TodayRow
      key={t.id}
      task={t}
      anyTime={anyTime}
      today={day}
      timeZone={timeZone}
      now={now}
      saved={savedId === t.id}
      onOpen={() => setOpenId(t.id)}
      onKeyDown={(e) => onRowKeyDown(e, t)}
      onStatus={(status) => setStatus(t.id, status)}
      onPatch={patch}
      onRan={() => focusRow(t.id)}
    />
  )

  const { inProgress, planned, overdue } = todaySegments(rows)
  const doneToday = (completed.data?.tasks ?? []).filter((t) => t.completedOn === day)
  const movementRows = (movement.data ?? []).filter(hasMovement)

  // The day's line: the planned tasks and the other modules' entries, each with its time if any.
  const items: DayItem[] = [
    ...planned.map((t): DayItem => {
      // A task is on the line when it is due today at a time; the end of the day is not a time.
      const lead = leadFor({ dueAt: t.dueAt, scheduledOn: null }, day, timeZone)
      const at = lead?.tone === 'deadline' && /^\d{2}:\d{2}$/.test(lead.text) ? lead.text : null
      return {
        key: `task:${t.id}`,
        at,
        hasLead: lead !== null,
        row: ({ anyTime }) => taskRow(t, anyTime),
      }
    }),
    ...entries.map((e): DayItem => ({
      key: `${e.moduleId}:${e.key}`,
      at: e.time,
      until: e.endTime,
      hasLead: e.time !== null,
      row: ({ past, anyTime }) => <EntryRow entry={e} past={past} anyTime={anyTime} />,
    })),
  ]

  return (
    <div className="mx-auto w-full max-w-[67.5rem] pt-4 sm:pt-6">
      <DayHeading now={now} today={day} timeZone={timeZone} />

      {today.isPending && <p className={`${HANG} text-ink-muted`}>Loading…</p>}
      {today.isError && (
        <p role="alert" className={`${HANG} text-danger`}>
          {problemText(today.error) ?? "Couldn't load. Check that the server is running."}
        </p>
      )}
      {error && (
        <p role="alert" className={`mb-3 ${HANG} text-sm text-danger`}>
          {error}
        </p>
      )}

      {/* The sections, and This week beside them where there is room for both. */}
      <div className="flex min-w-0 flex-col gap-12 lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-14">
        <div className="flex min-w-0 flex-col gap-9">
          <InProgressSection
            tasks={inProgress}
            today={day}
            timeZone={timeZone}
            savedId={savedId}
            onOpen={setOpenId}
            onKeyDown={onRowKeyDown}
            onStatus={setStatus}
          />

          <DaySection label="Today" count={planned.length + entries.length}>
            {today.isSuccess && items.length === 0 && <DayEmpty>Nothing for today</DayEmpty>}
            <DayLine items={items} now={clockTime(now, timeZone)} />
          </DaySection>

          {/* Only when something is overdue: a section reading "0" every day is noise. */}
          {overdue.length > 0 && (
            <DaySection label="Overdue" count={overdue.length}>
              <ul className={ROW_LIST}>{overdue.map((t) => taskRow(t))}</ul>
            </DaySection>
          )}

          {doneToday.length > 0 && <DoneTodayPanel tasks={doneToday} timeZone={timeZone} />}
        </div>

        {movementRows.length > 0 && <MovementPanel rows={movementRows} today={day} />}
      </div>

      {openTask && (
        <TaskDetail
          key={openTask.id}
          task={openTask}
          onClose={closeDetail}
          // Marks the row; the pane stays open even when the save took the row off this page.
          onSaved={() => setSavedId(openTask.id)}
        />
      )}
    </div>
  )
}

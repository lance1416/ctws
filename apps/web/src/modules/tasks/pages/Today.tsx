import type { TaskStatus, TodayTaskResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type KeyboardEvent } from 'react'
import { useShortcutsEnabled } from '../../../platform/keyboard/enabled'
import { clockTime, todayIn } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { HANG } from '../../../platform/ui/hang'
import { useTimeZone } from '../../../shell/auth/useMe'
import { useCrumbs } from '../../../shell/layout/Breadcrumbs'
import { useRegistry } from '../../../shell/registry'
import { DayEmpty, DaySection } from '../../../shell/rows/DaySection'
import { ROW_LIST } from '../../../shell/rows/RowParts'
import { leadFor } from '../../../shell/rows/leads'
import { completedQuery, movementQuery, todayQuery } from '../api/queries'
import { useTaskActions } from '../api/taskActions'
import { DayLine, type DayItem } from '../components/DayLine'
import { DoneTodayPanel } from '../components/DoneTodayPanel'
import { MovementPanel } from '../components/MovementPanel'
import { statusForKey } from '../components/StatusControls'
import { TaskDetail } from '../components/TaskDetail'
import { useFocusAfterRemoval } from '../components/useFocusAfterRemoval'
import { useSavedFlash } from '../components/useSavedFlash'
import { TASKS_ID } from '../id'
import { hasMovement } from '../movement'
import { todaySegments } from '../today'
import type { TriagePatch } from '../triage'
import { DayHeading } from './today/DayHeading'
import { EntryRow } from './today/EntryRow'
import { InProgressSection } from './today/InProgressSection'
import { TodayRow } from './today/TodayRow'

/**
 * TODAY: one sheet, the day's line down it.
 *
 *   Monday, October 12   九月初三          the date is the heading: this page is a day
 *   In progress                           what am I doing right now -- one is a banner
 *   Today                                 the day in time order, NOW across it, then Any time
 *   Overdue                               what was due and was not done
 *   Done today                            what I did
 *                              This week  where each line of work got to, beside or below
 *
 * Sections, not panels: one column of rows hung on one margin, so the times and dates of every
 * section read down a single edge, the way a diary's do.
 *
 * The day's line is EVERY KIND OF DATED THING: a meeting at 10:30 sits between the tasks due at
 * 09:00 and 16:00. Other modules come in through the calendar seam; tasks come from `todayQuery`
 * with their segments. The SERVER decides which segment a task is in, in the account's zone, and
 * the order within it; no task is in two places.
 */
export function Today() {
  useCrumbs([{ label: 'Today' }])
  const today = useQuery(todayQuery())
  // Shares `completedQuery` with Review's Done view: one request per session, not per visit.
  const completed = useQuery(completedQuery())
  const movement = useQuery(movementQuery())
  const timeZone = useTimeZone()
  // The moment it is, kept current while the page sits open: the now line, the date and which
  // day "today" is all follow it, in the account's calendar -- the one the server files by.
  const now = useNow()
  const day = todayIn(timeZone, now)
  const clock = clockTime(timeZone)
  // The other modules' dated things for today: one hook per provider, over the registry's fixed list.
  const entries = useRegistry()
    .calendar.filter((p) => p.moduleId !== TASKS_ID)
    .flatMap((p) =>
      p.useEntries({ from: day, to: day }).entries.map((e) => ({ ...e, moduleId: p.moduleId })),
    )
  const [openId, setOpenId] = useState<string | null>(null)
  const rows = today.data ?? []
  const openTask = rows.find((t) => t.id === openId)

  const [error, setError] = useState<string | null>(null)
  const singleKeys = useShortcutsEnabled()
  const actions = useTaskActions(setError)
  const [savedId, setSavedId] = useSavedFlash()

  // A change can take its row off this page (finished; stopped with no date; deadline cleared),
  // and so can the open pane. The order is DOM order across every section, the way the page reads.
  const focus = useFocusAfterRemoval({
    ids: () =>
      [...document.querySelectorAll<HTMLElement>('[data-today-row]')].map(
        (el) => el.dataset.todayRow!,
      ),
    rowFor: (id) => document.querySelector<HTMLElement>(`[data-today-row="${id}"]`),
    heading: () => document.getElementById('today-heading'),
    open: openId,
  })
  const setStatus = (id: string, status: TaskStatus) => {
    setError(null)
    focus.expect(id)
    actions.setStatus(id, status, () => focus.drop(id))
  }
  const patch = (id: string, body: TriagePatch) => {
    setError(null)
    focus.expect(id)
    actions.patch(id, body, () => focus.drop(id))
  }
  // After a triage action its menu unmounts, so focus goes back to the row (WCAG 2.4.3); if the
  // change then takes the row off the page, `focus` moves it on again.
  const focusRow = (id: string) =>
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

  // THE DAY'S LINE: the planned tasks and the other modules' entries, each with its time if any.
  const items: DayItem[] = [
    ...planned.map((t): DayItem => {
      // A task is ON the line when it is due today at a time; the end of the day is not a time.
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
      key: `${e.moduleId}:${e.id}`,
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
          {today.error instanceof Error
            ? today.error.message
            : "Couldn't load. Check that the server is running."}
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
            <DayLine items={items} now={clock.format(now)} />
          </DaySection>

          {/* Only when something IS overdue: a section reading "0" every day is noise. */}
          {overdue.length > 0 && (
            <DaySection label="Overdue" count={overdue.length}>
              <ul className={ROW_LIST}>{overdue.map((t) => taskRow(t))}</ul>
            </DaySection>
          )}

          {doneToday.length > 0 && <DoneTodayPanel tasks={doneToday} clock={clock} />}
        </div>

        {movementRows.length > 0 && <MovementPanel rows={movement.data ?? []} today={day} />}
      </div>

      {openTask && (
        <TaskDetail
          key={openTask.id}
          task={openTask}
          onClose={closeDetail}
          // Marks the row; the pane stays open, reading back what was written -- even when the
          // save took the row off this page.
          onSaved={() => setSavedId(openTask.id)}
        />
      )}
    </div>
  )
}

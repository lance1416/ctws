import { problemText } from '../../../platform/http/api'
import type { TodayTaskResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { clockTime } from '@ctws/core/clock'
import { ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { HANG } from '../../../platform/ui/hang'
import { useTimeZone } from '../../../shell/auth'
import { DayEmpty, DaySection, dueTodayAt, leadFor, ROW_LIST } from '../../../shell/rows'
import { completedQuery, movementQuery, todayQuery } from '../api'
import { DayLine, type DayItem } from '../components/DayLine'
import { DoneTodayPanel } from '../components/DoneTodayPanel'
import { MovementPanel } from '../components/MovementPanel'
import { TaskDetail } from '../components/TaskDetail'
import { useTaskParam } from '../components/tree/useTreeParams'
import { useSavedFlash } from '../components/useSavedFlash'
import { hasMovement } from '../logic/movement'
import { todaySegments } from '../logic/today'
import { DayHeading } from './today/DayHeading'
import { EntryRow } from './today/EntryRow'
import { InProgressSection } from './today/InProgressSection'
import { TodayRow } from './today/TodayRow'
import { useOthersToday, useTodayRows } from './today/useTodayRows'

/**
 * The day as one sheet: in progress, the day's line in time order, overdue, done today, and the
 * week beside them. The line holds every module's dated things; the server files each task.
 */
export function Today() {
  const timeZone = useTimeZone()
  // Kept current while the page sits open: the now line, the date and which day is today follow
  // it, and so do the server's lists, keyed by the day.
  const now = useNow()
  const day = ymd(now, timeZone)
  const today = useQuery(todayQuery(day))
  const completed = useQuery(completedQuery(day))
  const movement = useQuery(movementQuery(day))
  const entries = useOthersToday(day)
  // In the address, as on a project page: opening another row is a navigation, which the open
  // pane's unsaved-edit guard sees.
  const { openId, setOpenId } = useTaskParam()
  const rows = today.data ?? []

  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useSavedFlash()
  const { titles, pane, setStatus, patch, focusRow, onRowKeyDown } = useTodayRows({
    rows,
    settled: today.isSuccess,
    openId,
    setOpenId,
    setError,
  })
  const { openTask } = pane

  const taskRow = (t: TodayTaskResponse, anyTime = false) => (
    <TodayRow
      key={t.id}
      task={t}
      anyTime={anyTime}
      today={day}
      now={now}
      saved={savedId === t.id}
      rowRef={titles.ref(t.id)}
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
      return {
        key: `task:${t.id}`,
        at: dueTodayAt(t.dueAt, day, timeZone),
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
      <DayHeading today={day} />

      {today.isPending && <p className={`${HANG} text-muted`}>Loading…</p>}
      {today.isError && (
        <p role="alert" className={`${HANG} text-stop-t`}>
          {problemText(today.error) ?? "Couldn't load. Check that the server is running."}
        </p>
      )}
      {error && (
        <p role="alert" className={`mb-3 ${HANG} text-ui text-stop-t`}>
          {error}
        </p>
      )}

      {/* The sections, and This week beside them where there is room for both. */}
      <div className="flex min-w-0 flex-col gap-12 lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-14">
        <div className="flex min-w-0 flex-col gap-9">
          <InProgressSection
            tasks={inProgress}
            today={day}
            savedId={savedId}
            rowRef={titles.ref}
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

          {doneToday.length > 0 && <DoneTodayPanel tasks={doneToday} />}
        </div>

        {movementRows.length > 0 && <MovementPanel rows={movementRows} today={day} />}
      </div>

      {openTask && (
        <TaskDetail
          key={openTask.id}
          task={openTask}
          onClose={pane.close}
          // Marks the row. A save that takes the task off this page closes the pane with it, as on
          // every list (`useRowPane`).
          onSaved={() => setSavedId(openTask.id)}
        />
      )}
    </div>
  )
}

import { taskCrumb } from '../crumb'
import type { CalendarEntry, TaskStatus, TodayTaskResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { calendarDaysQuery } from '../../../shell/calendar/api'
import { completedQuery, movementQuery, todayQuery } from '../api/queries'
import { toggleDoneTarget, toggleStartTarget, useTaskActions } from '../api/taskActions'
import { DoneTodayPanel } from '../components/DoneTodayPanel'
import { MovementPanel } from '../components/MovementPanel'
import { hasMovement } from '../movement'
import { DayEmpty, DaySection } from '../../../shell/rows/DaySection'
import { DayLine, type DayItem } from '../components/DayLine'
import { blockedLabel } from '../blockedLabel'
import { ProjectRail, ROW_LIST } from '../../../shell/rows/RowParts'
import { OVER_ROW, RowMeta, RowNote, SavedMark } from '../components/TaskRowParts'
import { RowLead } from '../../../shell/rows/RowLead'
import { leadFor } from '../../../shell/rows/leads'
import { StartButton, StatusButton, statusForKey } from '../components/StatusControls'
import { StatusMark } from '../components/StatusMark'
import { useRegistry } from '../../../shell/registry'
import { TASKS_ID } from '../id'
import { TaskDetail } from '../components/TaskDetail'
import { useFocusAfterRemoval } from '../components/useFocusAfterRemoval'
import { TriageControl } from '../components/TriageControl'
import { clockTime, todayIn } from '../../../platform/time/dates'
import { dateHints } from '../dueDates'
import { useShortcutsEnabled } from '../../../platform/keyboard/enabled'
import { triageSections } from '../triage'
import { useTimeZone } from '../../../shell/auth/useMe'
import { useNow } from '../../../platform/time/useNow'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { useCrumbs } from '../../../shell/layout/Breadcrumbs'
import { HANG } from '../../../platform/ui/hang'

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
 * Sections, not panels: no boxes, one column of rows hung on one margin, so the times and the
 * dates of every section read down a single edge, the way a diary's do.
 *
 * TODAY'S LINE IS EVERY KIND OF DATED THING, not only tasks: a meeting at 10:30 sits between the
 * task due at 09:00 and the one due at 16:00. It reads the other modules through the calendar
 * seam (`calendarProviders`), so a new dated kind joins the line without this page changing --
 * and the TASKS provider is left out, because tasks come from `todayQuery` with their segments.
 *
 * The SERVER still decides which segment a task belongs to, in the account's zone, and the order
 * within it. No task is in two places: a task both overdue and in progress is shown once.
 */
export function Today() {
  useCrumbs([{ label: 'Today' }])
  const today = useQuery(todayQuery())
  // Shares `completedQuery` with Review's Done view, so the panel costs
  // one request per session rather than one per visit.
  const completed = useQuery(completedQuery())
  const movement = useQuery(movementQuery())
  const timezone = useTimeZone()
  // The moment it is, kept current while the page sits open (`useNow`): the now line, the date
  // and which day "today" is all follow it, and nothing below reads the clock for itself.
  const nowAt = useNow()
  // The account's own calendar day, for matching the server's `completedOn`. Never a browser-local
  // date: the server already decided which day a task was finished on, and the two must agree.
  // `todayIn` is the ONE place that answers this, for this page, the rows and the panel alike.
  const localToday = todayIn(timezone, nowAt)
  const clock = clockTime(timezone)
  // The other modules' dated things for today: one hook per provider, over the registry's fixed list.
  const entries = useRegistry()
    .calendar.filter((p) => p.moduleId !== TASKS_ID)
    .flatMap((p) =>
      p.useEntries({ from: localToday, to: localToday }).entries.map((e) => ({
        ...e,
        moduleId: p.moduleId,
      })),
    )
  // The day's own name in the lunar calendar, from the same source the Calendar grid uses.
  const lunar = useQuery(calendarDaysQuery({ from: localToday, to: localToday }))
  const [openId, setOpenId] = useState<string | null>(null)
  const rows = today.data ?? []
  const openTask = rows.find((t) => t.id === openId)

  const [error, setError] = useState<string | null>(null)
  const singleKeys = useShortcutsEnabled()
  const actions = useTaskActions(setError)
  // The row that just saved from the panel: it says so for a moment, since the panel is gone.
  const [savedId, setSavedId] = useState<string | null>(null)
  useEffect(() => {
    if (!savedId) return
    const timer = setTimeout(() => setSavedId(null), 2000)
    return () => clearTimeout(timer)
  }, [savedId])

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
  const patch = (id: string, body: Parameters<typeof actions.patch>[1]) => {
    setError(null)
    focus.expect(id)
    actions.patch(id, body, () => focus.drop(id))
  }
  // Where focus goes once a triage action has run. The panel and the button inside it unmount, so
  // without this focus would fall to <body> (WCAG 2.4.3). The row is still on screen at this
  // moment; if the change then takes it off the page, `focus` above moves focus on again.
  const focusRow = (id: string) =>
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-today-row="${id}"]`)?.focus())
  const onRowKeyDown = (e: KeyboardEvent, id: string, status: TaskStatus) => {
    // `s` and `x` are single-key shortcuts, so they answer to the same off switch as `/` and `f`.
    const next = singleKeys ? statusForKey(e, status) : null
    if (!next) return
    e.preventDefault()
    setStatus(id, next)
  }
  const todayYmd = localToday

  const closeDetail = () => {
    const id = openId
    setOpenId(null)
    // After the panel unmounts, return focus to the row it was opened from.
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

  type Entry = CalendarEntry & { moduleId: string }

  /**
   * ONE TASK ROW, on the anatomy (RowParts): the margin, the thread, then the body -- marker,
   * title and where it came from, a note on the right, then the controls, which wait for the
   * pointer or the keyboard. Where there is no hover they are always there.
   */
  const row = (t: TodayTaskResponse, anyTime = false): ReactNode => {
    const hints = dateHints(t, timezone, nowAt)
    // A plan for a day already gone, still not done: carried over, and said so on the right.
    const carried = t.segment === 'today' && t.scheduledOn !== null && t.scheduledOn < todayYmd
    const sections = triageSections(t, carried ? 'Carried over' : null, todayYmd, timezone, patch)
    const lead =
      leadFor(
        // A plan for TODAY says nothing on a page called Today, so it does not take the margin --
        // and nor does a carried one: it is today's now, at no time in particular, and the margin
        // of the day's line is its times. The day it was first meant for is said on the right.
        {
          dueAt: t.dueAt,
          scheduledOn: t.scheduledOn === todayYmd || carried ? null : t.scheduledOn,
        },
        todayYmd,
        timezone,
      ) ?? (anyTime ? { text: 'Any time', tone: 'quiet' as const, flag: false } : null)
    const carriedFrom =
      carried && leadFor({ dueAt: null, scheduledOn: t.scheduledOn }, todayYmd, timezone)?.text
    return (
      <li
        key={t.id}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('button')) setOpenId(t.id)
        }}
        className={`group relative flex cursor-pointer items-stretch ${
          // BLOCKED ROWS DIM AND STAY. Today stops answering what is due and answers what can be
          // worked on; hiding them would be the other mistake -- a list that loses tasks cannot be
          // trusted.
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
              onClick={() => setStatus(t.id, toggleDoneTarget(t.status))}
            />
          </span>
          <button
            type="button"
            data-today-row={t.id}
            onClick={() => setOpenId(t.id)}
            onKeyDown={(e) => onRowKeyDown(e, t.id, t.status)}
            className="flex min-w-0 flex-1 flex-col py-2.5 text-left"
          >
            <span className="flex min-w-0 items-baseline">
              <span
                data-row-title
                className={`truncate ${t.status === 'in_progress' ? 'font-semibold' : ''}`}
              >
                {t.title}
              </span>
              {savedId === t.id && <SavedMark />}
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
              onClick={() => setStatus(t.id, toggleStartTarget(t.status))}
            />
            {sections && (
              <TriageControl
                groupLabel={
                  t.segment === 'overdue' ? `Overdue: ${t.title}` : `Carried over: ${t.title}`
                }
                triggerLabel={`Change the dates for “${t.title}”`}
                sections={sections}
                onRan={() => focusRow(t.id)}
              />
            )}
          </span>
        </div>
      </li>
    )
  }

  /**
   * ONE ENTRY from another module -- a meeting, a birthday -- on the day's line. It has no
   * marker (it is not a task), keeps the marker's column so its title lines up with the tasks',
   * and goes where its module says. A meeting agreed in another zone says which beside its title:
   * the margin is your own clock, which answers when to be there.
   */
  const entryRow = (e: Entry, past: boolean, anyTime: boolean): ReactNode => (
    <li
      key={`${e.moduleId}:${e.id}`}
      data-day-entry={e.moduleId}
      className="group flex items-stretch"
    >
      <RowLead
        lead={
          e.time
            ? { text: e.time, tone: past ? 'quiet' : 'time', flag: false }
            : anyTime
              ? { text: 'Any time', tone: 'quiet', flag: false }
              : null
        }
      />
      <ProjectRail projectId={e.projectId} />
      <Link
        to={e.to}
        className="flex min-h-11 min-w-0 flex-1 items-start gap-x-2.5 pr-2 pl-3.5 group-hover:bg-hover"
      >
        <span aria-hidden="true" className="h-11 w-7 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col py-2.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span data-row-title className={`truncate ${past ? 'text-ink-subtle' : 'text-ink'}`}>
              {e.title}
            </span>
            {e.zone && (
              <span data-entry-zone className="shrink-0 text-sm text-ink-subtle">
                {e.zone}
              </span>
            )}
          </span>
          <RowMeta breadcrumb={e.projectName ?? e.kind} />
        </span>
      </Link>
    </li>
  )

  const inProgress = rows.filter((t) => t.segment === 'in_progress')
  // One thing in progress is THE thing; several are a list.
  const alone = inProgress.length === 1
  const queue = rows.filter((t) => t.segment === 'today')
  const overdue = rows.filter((t) => t.segment === 'overdue')
  const doneToday = (completed.data?.tasks ?? []).filter((t) => t.completedOn === localToday)
  const movementRows = (movement.data ?? []).filter(hasMovement)

  // THE DAY'S LINE: the queue and the other modules' entries, each with its time if it has one.
  const now = clock.format(nowAt)
  const items: DayItem[] = [
    ...queue.map((t): DayItem => {
      // A task is ON the line when it is due today at a time; the end of the day is not a time.
      const lead = leadFor({ dueAt: t.dueAt, scheduledOn: null }, todayYmd, timezone)
      const at = lead?.tone === 'deadline' && /^\d{2}:\d{2}$/.test(lead.text) ? lead.text : null
      return {
        key: `task:${t.id}`,
        at,
        hasLead: lead !== null,
        row: ({ anyTime }) => row(t, anyTime),
      }
    }),
    ...entries.map((e): DayItem => ({
      key: `${e.moduleId}:${e.id}`,
      at: e.time,
      until: e.endTime,
      hasLead: e.time !== null,
      row: ({ past, anyTime }) => entryRow(e, past, anyTime),
    })),
  ]

  const dateHeading = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  }).format(nowAt)

  return (
    <div className="mx-auto w-full max-w-[67.5rem] pt-4 sm:pt-6">
      {/* THE DATE IS THE HEADING: this page is a day, and which one is the first thing it says.
          The display step, at 500, set back where the titles start. Beside it the day's lunar
          name, a step quieter. */}
      <div className={`mb-8 ${HANG} flex flex-wrap items-baseline gap-x-4`}>
        <h1
          id="today-heading"
          tabIndex={-1}
          className="text-display font-medium tracking-[-0.022em] focus:outline-none max-sm:text-xl max-sm:font-semibold max-sm:tracking-normal"
        >
          {dateHeading}
        </h1>
        {lunar.data?.[localToday] && (
          <span data-lunar-day className="text-ink-subtle">
            {lunar.data[localToday]}
          </span>
        )}
      </div>

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
          {/*
            IN PROGRESS -- the first thing the eye should land on.

            THE SIZE ANSWERS "HOW MANY". One thing in progress is THE thing, and its title takes
            the scale's 36/44 step with Done and Pause beside it; several are a list, and several
            36px lines are a wall rather than a focal point, so they step down to rows.
          */}
          <DaySection label="In progress" count={alone ? undefined : inProgress.length}>
            {inProgress.length === 0 ? (
              <DayEmpty>Nothing in progress</DayEmpty>
            ) : (
              <ul className={ROW_LIST}>
                {inProgress.map((t) => {
                  const lead = leadFor(
                    {
                      dueAt: t.dueAt,
                      scheduledOn: t.scheduledOn === todayYmd ? null : t.scheduledOn,
                    },
                    todayYmd,
                    timezone,
                  )
                  return (
                    <li
                      key={t.id}
                      onClick={(e) => {
                        if (!(e.target as HTMLElement).closest('button')) setOpenId(t.id)
                      }}
                      className="group flex cursor-pointer items-stretch"
                    >
                      <RowLead lead={lead} />
                      <ProjectRail projectId={t.projectId} />
                      <div
                        className={`relative flex min-w-0 flex-1 items-start gap-x-2.5 pr-2 pl-3.5 group-hover:bg-hover ${
                          alone ? 'flex-wrap gap-y-2 py-2' : 'min-h-11'
                        }`}
                      >
                        {/* One: the mark, and Done beside it. Several: the mark IS the Done control,
                            which is all a touch screen gets -- Pause and the rest are in the sheet. */}
                        <span className="flex h-11 shrink-0 items-center">
                          {alone ? (
                            <StatusMark status={t.status} />
                          ) : (
                            <StatusButton
                              status={t.status}
                              title={t.title}
                              onClick={() => setStatus(t.id, toggleDoneTarget(t.status))}
                            />
                          )}
                        </span>
                        <button
                          type="button"
                          data-today-row={t.id}
                          onClick={() => setOpenId(t.id)}
                          onKeyDown={(e) => onRowKeyDown(e, t.id, t.status)}
                          // One: at least 12rem, so Done and Pause wrap under a short line rather
                          // than squeeze it -- never more than the row has. Several: a row.
                          className={`flex flex-1 flex-col text-left ${
                            alone ? 'min-w-[min(12rem,100%)]' : 'min-w-0 py-2.5'
                          }`}
                        >
                          <span className="flex min-w-0 items-baseline">
                            <span
                              data-doing-title
                              // One: said in full, on as many lines as it takes -- it is the line
                              // the page is for. Several: a list, one line each.
                              className={`font-semibold ${
                                alone
                                  ? 'min-w-0 text-2xl [overflow-wrap:anywhere] max-sm:text-xl'
                                  : 'truncate text-base'
                              }`}
                            >
                              {t.title}
                            </span>
                            {savedId === t.id && <SavedMark />}
                          </span>
                          <span className="truncate text-sm text-ink-muted">{taskCrumb(t)}</span>
                        </button>
                        {/* The visible word is contained in the accessible name (WCAG 2.5.3):
                            "Done" in “Complete “Title””. On a list they wait for the pointer. */}
                        <span
                          className={`flex shrink-0 items-center gap-2 ${
                            alone
                              ? 'self-center'
                              : // Over the row, not in it: they take no width from the title.
                                `absolute top-0 right-1 h-11 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:hidden ${OVER_ROW}`
                          }`}
                        >
                          {/* One thing: the one press the page is for, filled. Several: the mark
                              at the row's start is Done, so a second Done would be one action
                              with two names. */}
                          {alone && (
                            <button
                              type="button"
                              aria-label={`Complete “${t.title}”`}
                              onClick={() => setStatus(t.id, toggleDoneTarget(t.status))}
                              className={BUTTON.primary}
                            >
                              Done
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`Pause “${t.title}”`}
                            onClick={() => setStatus(t.id, toggleStartTarget(t.status))}
                            className={BUTTON.secondary}
                          >
                            Pause
                          </button>
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </DaySection>

          <DaySection label="Today" count={queue.length + entries.length}>
            {today.isSuccess && items.length === 0 && <DayEmpty>Nothing for today</DayEmpty>}
            <DayLine items={items} now={now} />
          </DaySection>

          {/* Only when something IS overdue: a section reading "0" every day is noise. */}
          {overdue.length > 0 && (
            <DaySection label="Overdue" count={overdue.length}>
              <ul className={ROW_LIST}>{overdue.map((t) => row(t))}</ul>
            </DaySection>
          )}

          {doneToday.length > 0 && <DoneTodayPanel tasks={doneToday} clock={clock} />}
        </div>

        {movementRows.length > 0 && <MovementPanel rows={movement.data ?? []} today={localToday} />}
      </div>

      {openTask && (
        <TaskDetail
          key={openTask.id}
          task={openTask}
          onClose={closeDetail}
          onSaved={() => {
            // Marks the row; the pane stays open in reading mode. The save may have taken the
            // row off this page, and that is fine: what was written is still on screen beside
            // the list it left.
            setSavedId(openTask.id)
          }}
        />
      )}
    </div>
  )
}

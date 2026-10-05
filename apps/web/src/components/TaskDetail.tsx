import {
  TASK_STATUSES,
  type TaskResponse,
  type TaskStatus,
  type UpdateTaskBody,
} from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useBlocker } from 'react-router-dom'
import { listProjects } from '../api/projects'
import { deleteTask, listProjectTasks, moveTask, patchTask } from '../api/tasks'
import { tasksKey } from '../api/taskCache'
import { addDays, dayPhrase, moveDueToDay, nextMonday, ymd } from '../dueAt'
import { projectRailClass } from '../projectColor'
import { DeleteConfirm } from './DeleteConfirm'
import { useReservePane, useWidePane } from './detailPane'
import { LeaveGuardContext } from './leaveGuard'
import { DeadlineMark, PlanMark } from './RowParts'
import { StatusMark } from './StatusMark'

// An empty date input yields '' , and the contract takes a date or null. Sending '' would be
// rejected; silently coercing it to today would be worse.
export const orNull = (v: string) => (v.trim() === '' ? null : v)

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: '待整理',
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
  cancelled: '已取消',
}

const pad = (n: number) => String(n).padStart(2, '0')

/** An instant as the local "YYYY-MM-DDTHH:mm" a datetime-local input shows; '' when absent. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The inverse: a local datetime-local value as the instant (with offset) the contract takes. */
export function fromLocalInput(v: string): string | null {
  const s = orNull(v)
  return s === null ? null : new Date(s).toISOString()
}

const field =
  'w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-fg leading-snug'
/** The section label. Small, muted, and the same on every block, so the blocks read as peers. */
const label = 'block text-xs text-fg-muted'
/** A named decision: the same shape as the row's triage buttons, so the two speak one language. */
const decision =
  'rounded-md border border-border-subtle px-2 py-1 text-sm text-fg hover:border-border-strong hover:bg-surface'
/**
 * The exact field, for the days the three named decisions do not cover. Quieter than them on
 * purpose -- it is the fallback, and a full-width boxed input made the rarer route the loudest
 * thing in the block -- but quieter by SIZE, not by a fainter edge: an input's edge is what says
 * "this is a control", so it keeps `border-strong` (styles.css: border-subtle is decorative only).
 */
const exact =
  'w-full max-w-[14rem] rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-fg'

/**
 * The exact local day and time, said the way the rest of the app says it ("明天 14:30"), under the
 * native date control.
 *
 * It is here because a native date input renders its format in the BROWSER'S UI language, which
 * the page cannot set (not through `lang`, not through the JS locale -- verified), so the field
 * itself may read `dd/mm/yyyy` on one machine and `yyyy/mm/dd` on another. The echo is the app
 * saying back, in its own words, which day it understood -- which is the thing the reader actually
 * needs, and it is right whatever the field prints.
 */
function DateEcho({ text }: { text: string | null }) {
  if (!text) return null
  return <p className="mt-1 text-2xs tabular-nums text-fg-muted">{text}</p>
}

type Props = {
  task: TaskResponse
  projectId: string
  /** Dismissed without saving (and with nothing to lose, or after the user chose to discard). */
  onClose: () => void
  /** The save was accepted by the server; the owner closes the panel and acknowledges it. */
  onSaved: () => void
}

const TABBABLE = 'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])'

export function TaskDetail({ task, projectId, onClose, onSaved }: Props) {
  const qc = useQueryClient()
  const panel = useRef<HTMLDivElement>(null)
  // At >=1280 the detail is a third COLUMN, not a layer: no scrim, no click-outside, no focus
  // trap, and the list it was opened from stays usable beside it. Below that width there is no
  // room for both, so it goes back to being an overlay and takes the keyboard with it.
  const wide = useWidePane()
  useReservePane()
  // The panel is last in the DOM, so without this a keyboard user would tab past every row to
  // reach it. Escape also only works while focus is inside.
  useEffect(() => panel.current?.focus(), [])
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [scheduledOn, setScheduledOn] = useState(task.scheduledOn ?? '')
  const [dueAt, setDueAt] = useState(toLocalInput(task.dueAt))
  const [nextProjectId, setNextProjectId] = useState(task.projectId)

  // What the form started from, fixed at mount: a background refetch of `task` must not make an
  // untouched form look edited (or an edited one look clean).
  const initial = useRef({
    title: task.title,
    notes: task.notes ?? '',
    status: task.status,
    scheduledOn: task.scheduledOn ?? '',
    dueAt: toLocalInput(task.dueAt),
    projectId: task.projectId,
  })
  const dirty =
    title !== initial.current.title ||
    notes !== initial.current.notes ||
    status !== initial.current.status ||
    scheduledOn !== initial.current.scheduledOn ||
    dueAt !== initial.current.dueAt ||
    nextProjectId !== initial.current.projectId
  // Deleting a task takes its subtree with it and cannot be undone, so it asks first, naming what
  // is lost. The descendant count is read live when the question opens (the panel's own task
  // list may be a page that never loaded this project's tree).
  const [deleting, setDeleting] = useState<{ descendants: number | null } | null>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const askDelete = async () => {
    setDeleting({ descendants: null })
    try {
      const all = await qc.fetchQuery({
        queryKey: tasksKey(task.projectId),
        queryFn: () => listProjectTasks(task.projectId),
        staleTime: 0,
      })
      let count = 0
      let frontier = [task.id]
      while (frontier.length > 0) {
        const kids = all.filter((t) => t.parentId !== null && frontier.includes(t.parentId))
        count += kids.length
        frontier = kids.map((t) => t.id)
      }
      setDeleting({ descendants: count })
    } catch {
      // Without the count the person would be confirming blind; say so and let them cancel.
      setDeleting({ descendants: -1 })
    }
  }
  const cancelDelete = () => {
    setDeleting(null)
    queueMicrotask(() => deleteButton.current?.focus())
  }
  const remove = useMutation({
    mutationFn: () => deleteTask(task.id),
    // Settled, not success: a failed delete may still have changed what the lists should show.
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ['today'] })
      await qc.invalidateQueries({ queryKey: ['completed'] })
      await qc.invalidateQueries({ queryKey: tasksKey(task.projectId) })
    },
  })

  // The named decisions, the same three days the row's triage control offers (今天 / 明天 / 下周)
  // plus the way out. They write the SAME fields the exact inputs write and are saved by the same
  // Save press -- they are a faster way to type a date, not a second way to change the task.
  const todayYmd = ymd(new Date())
  const DAYS: [string, string][] = [
    ['今天', todayYmd],
    ['明天', addDays(todayYmd, 1)],
    ['下周', nextMonday(todayYmd)],
  ]
  /** Keeps the time of day when there already is one; a new deadline means "by the end of it". */
  const setDueDay = (day: string) => {
    const from = fromLocalInput(dueAt)
    setDueAt(toLocalInput(from ? moveDueToDay(from, day) : `${day}T23:59:00`))
  }
  const dueEcho = (() => {
    const iso = fromLocalInput(dueAt)
    if (!iso) return null
    const d = new Date(iso)
    return `${dayPhrase(ymd(d), todayYmd)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  })()
  const planEcho = scheduledOn ? dayPhrase(scheduledOn, todayYmd) : null

  // The panel starts below the sticky top bar rather than over it, so the capture box and the
  // account controls stay visible and usable while a task is open.
  const [top, setTop] = useState(0)
  useLayoutEffect(() => {
    const measure = () =>
      setTop(document.querySelector('header')?.getBoundingClientRect().bottom ?? 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const save = useMutation({
    mutationFn: async () => {
      // Only what changed: an untouched due time must not be rewritten at minute precision.
      const patch: UpdateTaskBody = {}
      if (title.trim() !== task.title) patch.title = title.trim()
      if (orNull(notes) !== (task.notes ?? null)) patch.notes = orNull(notes)
      if (status !== task.status) patch.status = status
      if (orNull(scheduledOn) !== task.scheduledOn) patch.scheduledOn = orNull(scheduledOn)
      if (dueAt !== toLocalInput(task.dueAt)) patch.dueAt = fromLocalInput(dueAt)
      if (Object.keys(patch).length > 0) await patchTask(task.id, patch)
      if (nextProjectId !== task.projectId) {
        // Crossing projects is a structural change: `move` cascades project_id to the subtree and
        // enforces the invariants. A PATCH would not. parentId resets to null because the old
        // parent does not exist in the destination.
        await moveTask(task.id, { projectId: nextProjectId, parentId: null })
      }
    },
    // Settled, not success: if the move fails after the patch landed, the list is still stale.
    onSettled: async () => {
      // The today list is cross-project and server-derived: any edit can move a task between
      // segments or off the list, so it is always refetched.
      await qc.invalidateQueries({ queryKey: ['today'] })
      await qc.invalidateQueries({ queryKey: ['completed'] })
      await qc.invalidateQueries({ queryKey: tasksKey(projectId) })
      if (nextProjectId !== projectId)
        await qc.invalidateQueries({ queryKey: tasksKey(nextProjectId) })
    },
  })

  // Leaving with unsaved edits asks first, in the panel: a browser confirm() would block the
  // automation this app is tested with, and the typing would be lost without a word otherwise.
  // Three ways to lose the form, one prompt: closing the panel, navigating away (the router
  // blocker also catches the browser's back button), and Log out (not a navigation, so the
  // layout asks through LeaveGuardContext instead).
  const [askDiscard, setAskDiscard] = useState(false)
  const [logoutVia, setLogoutVia] = useState<(() => void) | null>(null)
  // A save that is in flight (or has landed, with the panel about to close) loses nothing, so it
  // must not trap the person who pressed Save and then, at once, a nav link.
  const unsaved = dirty && !save.isPending && !save.isSuccess
  const blocker = useBlocker(unsaved)
  const leaving = blocker.state === 'blocked' || logoutVia !== null
  const asking = askDiscard || leaving
  const keepEditing = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (asking) keepEditing.current?.focus()
  }, [asking])
  const requestClose = () => (dirty ? setAskDiscard(true) : onClose())
  const dirtyNow = useRef(unsaved)
  dirtyNow.current = unsaved
  const guard = useContext(LeaveGuardContext)
  useEffect(() => {
    if (!guard) return
    guard.current = (go) => {
      if (!dirtyNow.current) return false
      setLogoutVia(() => go)
      return true
    }
    return () => {
      guard.current = null
    }
  }, [guard])
  const keepEditingNow = () => {
    setAskDiscard(false)
    setLogoutVia(null)
    if (blocker.state === 'blocked') blocker.reset()
  }
  const discard = () => {
    if (blocker.state === 'blocked') blocker.proceed()
    else if (logoutVia) logoutVia()
    else onClose()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // A second Escape on the discard prompt means "keep editing"; on the delete question, "no".
      if (deleting) cancelDelete()
      else if (asking) keepEditingNow()
      else requestClose()
    } else if (e.key === 'Tab' && !wide) {
      // Trap: Tab cycles inside the panel. Left alone it would walk on into whatever the panel
      // is covering, which is invisible to the person pressing the key.
      const items = [...(panel.current?.querySelectorAll<HTMLElement>(TABBABLE) ?? [])].filter(
        (el) => !el.hasAttribute('disabled'),
      )
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return e.preventDefault()
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <>
      {/* Click-outside, and the wash that tells you the page behind is not the thing in hand.
          Only in overlay mode: as a coexisting pane, a click on the list is a click on the list. */}
      {!wide && (
        <div
          aria-hidden="true"
          data-detail-backdrop
          onClick={requestClose}
          style={{ top }}
          className="fixed inset-x-0 bottom-0 z-20 bg-scrim"
        />
      )}
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-label="任务详情"
        data-detail-mode={wide ? 'pane' : 'overlay'}
        onKeyDown={onKeyDown}
        style={{ top }}
        className={`fixed right-0 bottom-0 z-20 overflow-y-auto border-l border-border-subtle p-5 text-fg focus:outline-none ${
          // A COLUMN is chrome, so it wears the same sunken surface as the rail and the top bar.
          // A LAYER is above the page, so it wears the raised one and has the scrim under it.
          wide ? 'w-[22.5rem] bg-surface-sunken' : 'w-full max-w-md bg-surface-raised'
        }`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            // After the lists have refetched, so the row behind the panel is already up to date.
            if (title.trim() && !save.isPending) save.mutate(undefined, { onSuccess: onSaved })
          }}
          className="flex flex-col gap-5"
        >
          {/* The pane opens with the TASK: where it lives, then what it is called. It used to
              open with the word 标题 over an input, which made a task read as a settings form.
              The project is the identity line AND the control that moves it -- one thing, not a
              breadcrumb at the top and a duplicate dropdown at the bottom. The chip beside it is
              never alone: the project's NAME is right there (WCAG 1.4.1). */}
          <div>
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`h-3.5 w-[3px] shrink-0 rounded-full ${projectRailClass(nextProjectId)}`}
              />
              <select
                aria-label="项目"
                value={nextProjectId}
                onChange={(e) => setNextProjectId(e.target.value)}
                className="-ml-0.5 max-w-full rounded-md bg-transparent py-0.5 text-sm text-fg-muted hover:text-fg"
              >
                {(projects.data ?? [])
                  .filter((p) => !p.archivedAt || p.id === task.projectId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <input
              aria-label="标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md bg-transparent py-0.5 text-lg font-semibold text-fg"
            />
          </div>

          {/* Status speaks the vocabulary the rows speak: the same five marker shapes, named.
              A dropdown of words made the app's core semantic something you had to open a menu
              to read. Native radios on purpose -- the group is one tab stop and the arrow keys
              move within it, for free and correctly. */}
          <div role="radiogroup" aria-labelledby="detail-status-label">
            <span id="detail-status-label" className={label}>
              状态
            </span>
            {/* Three to a row rather than free wrapping: five chips of unequal width left 已取消
                hanging alone on a second line like an afterthought, and it is not one. */}
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {TASK_STATUSES.map((s) => (
                <label
                  key={s}
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border-subtle py-1 pr-2 pl-1.5 text-sm text-fg-muted hover:bg-surface has-[:checked]:border-border-strong has-[:checked]:bg-surface has-[:checked]:font-medium has-[:checked]:text-fg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                >
                  <input
                    type="radio"
                    name="detail-status"
                    value={s}
                    checked={status === s}
                    onChange={() => setStatus(s)}
                    className="sr-only"
                  />
                  {/* aria-hidden: the radio's name comes from the text beside it, and a marker
                      that also announced 「进行中」 would say it twice. */}
                  <span aria-hidden="true" className="flex">
                    <StatusMark status={s} />
                  </span>
                  {STATUS_LABEL[s]}
                </label>
              ))}
            </div>
          </div>

          {/* The two dates, wearing the glyph and the colour family the rows wear (a flag for a
              deadline, warm; a tick on a timeline for a plan, cool). Each offers the same named
              decisions the row's triage control offers -- 今天 / 明天 / 下周 and the way out --
              AND an exact field for everything those three do not cover. */}
          <div>
            <label
              htmlFor="detail-due"
              className="flex items-center gap-1 text-sm font-medium text-deadline"
            >
              <DeadlineMark filled={false} />
              截止
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {DAYS.map(([word, day]) => (
                <button
                  key={word}
                  type="button"
                  onClick={() => setDueDay(day)}
                  className={decision}
                >
                  {word}截止
                </button>
              ))}
              <button type="button" onClick={() => setDueAt('')} className={decision}>
                取消截止
              </button>
            </div>
            <input
              id="detail-due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className={`${exact} mt-1.5`}
            />
            <DateEcho text={dueEcho} />
          </div>

          <div>
            <label
              htmlFor="detail-plan"
              className="flex items-center gap-1 text-sm font-medium text-plan"
            >
              <PlanMark />
              排期
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {DAYS.map(([word, day]) => (
                <button
                  key={word}
                  type="button"
                  onClick={() => setScheduledOn(day)}
                  className={decision}
                >
                  排到{word}
                </button>
              ))}
              <button type="button" onClick={() => setScheduledOn('')} className={decision}>
                清除排期
              </button>
            </div>
            <input
              id="detail-plan"
              type="date"
              value={scheduledOn}
              onChange={(e) => setScheduledOn(e.target.value)}
              className={`${exact} mt-1.5`}
            />
            <DateEcho text={planEcho} />
          </div>

          <label className={label}>
            备注
            {/* The one place in the app that keeps a READING measure: notes are prose, and
                68ch is where prose wants to wrap. Nothing else does, which is the whole point
                of the redesign -- a list is scanned, not read. */}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className={`${field} mt-1.5 max-w-[68ch]`}
            />
          </label>
          {asking && (
            <div role="alert" className="rounded-md border border-border-strong p-3 text-sm">
              <p className="text-fg">
                {leaving ? '有未保存的修改，离开会丢掉它们。' : '有未保存的修改，关闭会丢掉它们。'}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  ref={keepEditing}
                  type="button"
                  onClick={keepEditingNow}
                  className="h-9 rounded-md bg-accent px-3 font-medium text-accent-fg hover:opacity-90"
                >
                  继续编辑
                </button>
                <button
                  type="button"
                  onClick={discard}
                  className="h-9 rounded-md border border-border-strong px-3 text-fg hover:bg-surface-sunken"
                >
                  放弃修改
                </button>
              </div>
            </div>
          )}
          {save.isError && (
            <p role="alert" className="text-sm text-danger">
              {save.error instanceof Error ? save.error.message : '保存失败'}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={save.isPending || !title.trim()}
              className="h-10 rounded-md bg-accent px-4 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
            >
              保存
            </button>
            <button
              type="button"
              onClick={requestClose}
              className="h-10 rounded-md border border-border-strong px-4 text-fg hover:bg-surface-sunken"
            >
              关闭
            </button>
          </div>
          {/* Destroying the task is not a peer of saving it. It sits below the rule, at the size
              of a footnote, where nothing lands on it by accident on the way to 保存. */}
          <div className="mt-2 border-t border-border-subtle pt-3">
            <button
              ref={deleteButton}
              type="button"
              onClick={askDelete}
              className="-mx-2 rounded-md px-2 py-1 text-sm text-fg-muted hover:text-danger"
            >
              删除任务
            </button>
          </div>
          {deleting && (
            <DeleteConfirm
              label="确认删除任务"
              className="-mt-3 rounded-md border border-border-strong p-3"
              message={
                deleting.descendants === null
                  ? `删除「${task.title}」…`
                  : deleting.descendants < 0
                    ? `删除「${task.title}」及其全部子任务，无法恢复。`
                    : deleting.descendants === 0
                      ? `删除「${task.title}」，无法恢复。`
                      : `删除「${task.title}」及其 ${deleting.descendants} 条子任务，无法恢复。`
              }
              busy={deleting.descendants === null || remove.isPending}
              onConfirm={() => remove.mutate()}
              onCancel={cancelDelete}
            />
          )}
          {remove.isError && (
            <p role="alert" className="text-sm text-danger">
              {remove.error instanceof Error ? remove.error.message : '删除失败'}
            </p>
          )}
        </form>
      </div>
    </>
  )
}

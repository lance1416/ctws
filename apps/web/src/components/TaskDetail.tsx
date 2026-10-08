import {
  TASK_STATUSES,
  type TaskResponse,
  type TaskStatus,
  type UpdateTaskBody,
} from '@ctws/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useBlocker } from 'react-router-dom'
import { tabbable } from 'tabbable'
import { listProjects } from '../api/projects'
import { deleteTask, listProjectTasks, moveTask, patchTask } from '../api/tasks'
import { tasksKey } from '../api/taskCache'
import {
  addDays,
  dayEndIso,
  dayPhrase,
  fromDayTimeInput,
  moveDueToDay,
  nextMonday,
  overdueLabel,
  toDayTimeInput,
  todayIn,
  ymd,
} from '../dueAt'
import { NoteBody } from '../notes/NoteBody'
import { WritingMode } from '../notes/WritingMode'
import { useProjectRail } from '../projectColor'
import { DeleteConfirm } from './DeleteConfirm'
import { useReservePane, useWidePane } from './detailPane'
// The shared editing vocabulary, now that the 新建 dialog types into a task as well.
import { decision, field, label } from './formStyles'
import { LeaveGuardContext } from './leaveGuard'
import { DeadlineMark, PlanMark } from './RowParts'
import { StatusMark } from './StatusMark'
import { detailTaskForm, PATCH_KEYS, type DetailTaskForm, type DetailTaskValues } from './taskForm'
import { useTimeZone } from '../useMe'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: '待整理',
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
  cancelled: '已取消',
}

/**
 * The exact field, for the days the three named decisions do not cover. Quieter than them on
 * purpose -- it is the fallback, and a full-width boxed input made the rarer route the loudest
 * thing in the block -- but quieter by SIZE, not by a fainter edge: an input's edge is what says
 * "this is a control", so it keeps `border-strong` (styles.css: border-subtle is decorative only).
 */
const exact =
  'h-9 w-full max-w-[14rem] rounded-lg border border-border-strong bg-surface px-2 text-sm text-fg'

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
  return <p className="mt-1 text-xs tabular-nums text-fg-muted">{text}</p>
}

type Props = {
  task: TaskResponse
  projectId: string
  /** Dismissed without saving (and with nothing to lose, or after the user chose to discard). */
  onClose: () => void
  /** The save was accepted by the server; the owner closes the panel and acknowledges it. */
  onSaved: () => void
}

/**
 * The pane's one way out that is not a keypress.
 *
 * An icon and not the word 「关闭」: a text button of that size sat in the control row as a peer
 * of 编辑 and 保存, which read as though closing were something you DO to the task. Every panel
 * of this shape -- Linear's peek, Notion's side peek -- puts a small ✕ in the corner and leaves
 * Escape as the real shortcut. `aria-label` carries the word for anyone who needs it.
 */
function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="关闭"
      data-detail-close
      className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover hover:text-fg"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4">
        <path
          d="M4 4l8 8M12 4l-8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}

export function TaskDetail({ task, projectId, onClose, onSaved }: Props) {
  const qc = useQueryClient()
  /**
   * THE ACCOUNT'S ZONE, for every day and clock on this panel -- including the exact
   * `datetime-local` field, whose value is bare wall-clock text with no zone in it. Reading that
   * field as the BROWSER's wall clock is what made the pane a third notion of "today" beside the
   * row's and the server's; it now means the same zone as both.
   */
  const timeZone = useTimeZone()
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
  const rail = useProjectRail()
  /**
   * THE FORM IS `react-hook-form`'S, FOR TWO THINGS AND NOT A THIRD.
   *
   * 1. `formState.isDirty` replaces six `useState`s compared one by one against a mount-time
   *    snapshot.
   * 2. `formState.dirtyFields` replaces the hand-written patch diff -- six `if (x !== task.x)`
   *    lines that had to be remembered once per field -- with the contract's own key list.
   *
   * It does NOT replace the leave guard. Closing, navigating and logging out are three ways to lose
   * the form and only the first is a form event; the other two are `useBlocker` and
   * `LeaveGuardContext`, and dragging them into a form library would be filing routing under
   * validation. They are below, untouched.
   *
   * `defaultValues` is read once, on the first render -- which is exactly the mount-time snapshot
   * the hand-written `initial` ref existed to take, and for the same reason: a background refetch of
   * `task` must not make an untouched form look edited, or an edited one look clean.
   *
   * The DEADLINE is held as the INSTANT the contract takes, not as the `datetime-local` text, so
   * `dirtyFields.dueAt` is an answer about the task and not about a widget's formatting. It is
   * normalised through the field's own minute precision first, so an untouched deadline whose stored
   * value carries seconds is not reported as changed (and so is not rewritten at minute precision).
   */
  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    getValues,
    formState: { dirtyFields, isDirty },
  } = useForm<DetailTaskForm, unknown, DetailTaskValues>({
    resolver: zodResolver(detailTaskForm),
    defaultValues: {
      projectId: task.projectId,
      title: task.title,
      notes: task.notes,
      status: task.status,
      scheduledOn: task.scheduledOn,
      dueAt: fromDayTimeInput(toDayTimeInput(task.dueAt, timeZone), timeZone),
    },
  })
  const title = watch('title')
  const scheduledOn = watch('scheduledOn')
  const dueAt = watch('dueAt')
  const nextProjectId = watch('projectId')
  /**
   * READING MODE IS THE DEFAULT (spec §5), and it is what answers both halves of the complaint:
   * 「想要的信息在二层菜单」 and 「编辑和信息显示在同一个地方，容易误触」.
   *
   * Looking something up now costs nothing and risks nothing: there is not one control on screen
   * that can change a value, so a mis-aimed click cannot edit the task. The editing controls are
   * all behind 编辑, which is also where the notes will one day render Markdown into -- a reading
   * mode had to exist for that anyway.
   *
   * It is NOT autosave. Explicit 保存 and the unsaved-edit guard (close, navigate, log out) are
   * unchanged; this only decides whether the controls those guard are on screen yet.
   */
  const [editing, setEditing] = useState(false)
  const titleField = useRef<HTMLInputElement | null>(null)
  const { ref: registerTitle, ...titleRest } = register('title')
  const startEditing = () => {
    setEditing(true)
    // The first field, not the panel: 编辑 is a request to type, and the control the press
    // destroyed must not take focus to <body> with it (WCAG 2.4.3).
    queueMicrotask(() => titleField.current?.focus())
  }

  /**
   * THE FULL-SCREEN WRITING MODE (D73, artboard H) -- the escape hatch of editing model A.
   *
   * It is reached FROM editing mode and returns TO it: the pane keeps the form, the save and the
   * guard, and the layer is only a bigger place to type. `notes` is the one field it touches, and
   * it writes through `setValue(..., { shouldDirty: true })` so an edit made in there is an edit as
   * far as `isDirty`, the router blocker and the log-out guard are concerned.
   */
  const [writing, setWriting] = useState(false)
  const notesSource = watch('notes')

  const dirty = isDirty
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
      await qc.invalidateQueries({ queryKey: ['movement'] })
      await qc.invalidateQueries({ queryKey: tasksKey(task.projectId) })
    },
  })

  // The named decisions, the same three days the row's triage control offers (今天 / 明天 / 下周)
  // plus the way out. They write the SAME fields the exact inputs write and are saved by the same
  // Save press -- they are a faster way to type a date, not a second way to change the task.
  const todayYmd = todayIn(timeZone)
  const DAYS: [string, string][] = [
    ['今天', todayYmd],
    ['明天', addDays(todayYmd, 1)],
    ['下周', nextMonday(todayYmd)],
  ]
  /**
   * Keeps the time of day when there already is one; a new deadline means "by the end of it".
   *
   * `shouldDirty`, on every one of these: a named day pressed is an edit, so it has to reach
   * `isDirty` (the unsaved-edit guard) and `dirtyFields` (the request body) exactly as typing into
   * the field does. Without it the library's default is to write the value and say nothing.
   */
  const setDueDay = (day: string) => {
    setValue('dueAt', dueAt ? moveDueToDay(dueAt, day, timeZone) : dayEndIso(day, timeZone), {
      shouldDirty: true,
    })
  }
  /** An instant in the app's own words: 「明天 14:30」, on the account's calendar and clock. */
  const say = (iso: string) => {
    const [day, clock] = toDayTimeInput(iso, timeZone).split('T') as [string, string]
    return `${dayPhrase(day, todayYmd)} ${clock}`
  }
  const dueEcho = dueAt ? say(dueAt) : null
  const planEcho = scheduledOn ? dayPhrase(scheduledOn, todayYmd) : null

  // What reading mode says the two dates are. The SERVER's values, said in the app's own words --
  // never the wire format, which is a thing to parse rather than to read.
  // A deadline whose day has gone says so, in the row's own words and the row's own `missed`
  // colour. Without it the pane was the one place in the app where "this is late" was invisible,
  // and reading mode is precisely where someone goes to look that up.
  const dueOverdue = task.dueAt !== null && ymd(new Date(task.dueAt), timeZone) < todayYmd
  const dueReading = (() => {
    if (!task.dueAt) return null
    const exact = say(task.dueAt)
    return dueOverdue ? `${exact} · ${overdueLabel(task.dueAt, timeZone)}` : exact
  })()
  const planReading = task.scheduledOn ? dayPhrase(task.scheduledOn, todayYmd) : null
  const projectName = projects.data?.find((p) => p.id === task.projectId)?.name ?? ''

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
    mutationFn: async ({
      values,
      changed,
    }: {
      values: DetailTaskValues
      /** `dirtyFields`' own keys: which fields the person actually touched. */
      changed: Set<string>
    }) => {
      /**
       * ONLY WHAT CHANGED -- and the library is what knows it now. This was six `if (x !== task.x)`
       * lines, which is six chances to forget one and six comparisons that read the LIVE `task`
       * while `dirty` read the mount-time snapshot. The two notions could disagree: a background
       * refetch that changed a field nobody had touched made the old diff send the stale local value
       * back, quietly undoing someone else's edit. One notion now, and it is `dirtyFields`.
       *
       * The key list is the contract's (`PATCH_KEYS`), so a field added to the form is either in the
       * update contract -- and sent -- or rejected by the resolver before it gets here.
       */
      const patch: UpdateTaskBody = {}
      for (const key of PATCH_KEYS) {
        if (changed.has(key)) Object.assign(patch, { [key]: values[key] })
      }
      if (Object.keys(patch).length > 0) await patchTask(task.id, patch)
      if (changed.has('projectId')) {
        // Crossing projects is a structural change: `move` cascades project_id to the subtree and
        // enforces the invariants. A PATCH would not. parentId resets to null because the old
        // parent does not exist in the destination.
        await moveTask(task.id, { projectId: values.projectId, parentId: null })
      }
    },
    // Settled, not success: if the move fails after the patch landed, the list is still stale.
    onSettled: async () => {
      // The today list is cross-project and server-derived: any edit can move a task between
      // segments or off the list, so it is always refetched.
      await qc.invalidateQueries({ queryKey: ['today'] })
      await qc.invalidateQueries({ queryKey: ['completed'] })
      await qc.invalidateQueries({ queryKey: ['movement'] })
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
  // NOT `&& !save.isSuccess` any more. That term existed because the pane used to CLOSE on a
  // successful save, and the mutation's success flag was what let the closing navigation
  // through. The pane stays open now, so the flag would stay true for the rest of its life and
  // the guard would never fire again -- a second round of edits would walk away unprotected.
  // The save clears the form's own dirty state instead (`reset`), which is the honest signal.
  const unsaved = dirty && !save.isPending
  const blocker = useBlocker(unsaved)
  const leaving = blocker.state === 'blocked' || logoutVia !== null
  const asking = askDiscard || leaving
  const keepEditing = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (asking) keepEditing.current?.focus()
  }, [asking])
  /**
   * A QUESTION NOBODY CAN SEE IS NOT A GUARD. The discard prompt renders inside the pane's form, and
   * the writing mode is a full-screen layer over it -- so when the guard has something to ask (the
   * browser's back button is the way out of a layer that covers the whole window), the layer stands
   * down first and the question is on screen where the answer has to be given.
   */
  useEffect(() => {
    if (asking) setWriting(false)
  }, [asking])
  /**
   * Leaving the editing state, whichever way out: closing the pane, or stepping back to reading.
   * With unsaved edits the discard prompt asks first and `discard` runs whichever one was asked
   * for -- before this, both the prompt and Escape could only ever mean "close".
   */
  const [exitVia, setExitVia] = useState<(() => void) | null>(null)
  const leave = (go: () => void) => {
    if (!dirty) return go()
    setExitVia(() => go)
    setAskDiscard(true)
  }
  const stopEditing = () => {
    reset()
    setEditing(false)
    // Back to the control the press came from, not to <body> (WCAG 2.4.3).
    queueMicrotask(() => panel.current?.focus())
  }
  const requestClose = () => leave(onClose)
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
    setExitVia(null)
    if (blocker.state === 'blocked') blocker.reset()
  }
  const discard = () => {
    if (blocker.state === 'blocked') blocker.proceed()
    else if (logoutVia) logoutVia()
    else if (exitVia) exitVia()
    else onClose()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // A second Escape on the discard prompt means "keep editing"; on the delete question, "no".
      if (deleting) cancelDelete()
      else if (asking) keepEditingNow()
      // Escape unwinds ONE level: out of editing into reading, and only then out of the pane.
      else if (editing) leave(stopEditing)
      else requestClose()
    } else if (e.key === 'Tab' && !wide) {
      /**
       * Trap: Tab cycles inside the panel. Left alone it would walk on into whatever the panel is
       * covering, which is invisible to the person pressing the key.
       *
       * ONLY IN THE OVERLAY HALF (`!wide`). At >=1280 this is a third COLUMN beside a list the
       * reader can plainly see, and a trap there would lock them out of it -- the same WCAG 2.1.2
       * failure from the other end. That is also why the pane is not a Radix `Dialog.Content`:
       * `Dialog` marks the rest of the page `aria-hidden`, which is exactly what a coexisting
       * column must not do (see `Modal`). So the LAYER keeps a trap of its own -- but the ORDER
       * and the MEMBERSHIP of the cycle are `tabbable`'s, not a hand-written selector's.
       *
       * The selector that used to be here walked DOM order (so a positive `tabindex` came out in
       * the wrong place) and listed only `input, select, textarea, button, a[href], [tabindex]`,
       * filtered by the `disabled` ATTRIBUTE alone. It therefore missed `[contenteditable]`,
       * `iframe`, `details`/`summary` and `audio`/`video[controls]`, and counted things the
       * keyboard cannot reach: `inert` subtrees, `display:none`, `visibility:hidden`, `hidden`,
       * and anything inside a folded `<details>`. One hidden control sorting LAST was enough to
       * make `last.focus()` a no-op and let Tab walk out of the panel -- the same shape as the
       * 2.1.2 trap this project already shipped once. `tabbable` is the library that answer comes
       * from (it is what `focus-trap` and Radix's own `FocusScope` are built on).
       */
      const items = panel.current ? tabbable(panel.current) : []
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
        // In the column the panel is inset by the grid's own gutter, so the 16px is added to the
        // top as well -- a panel that started flush with the top bar and had air on three sides
        // would read as a sheet that had slid down from it.
        style={{ top: wide ? top + 16 : top }}
        className={`fixed z-20 overflow-y-auto p-5 text-fg focus:outline-none ${
          // A COLUMN is a PANEL in the page's right-hand column: the same surface, radius, hairline
          // and (in light) hair of shadow every other panel on the page wears, so it reads as part
          // of the page rather than a form bolted to the window's edge. Its 22rem plus the two
          // 16px gutters is the 24rem track Layout takes out of the grid for it.
          // A LAYER is above the page, so it is flush with the edges, wears the raised surface and
          // has the scrim under it.
          wide
            ? 'right-4 bottom-4 w-[22rem] rounded-xl border border-border-subtle bg-surface-panel shadow-panel'
            : 'right-0 bottom-0 w-full max-w-md border-l border-border-subtle bg-surface-raised'
        }`}
      >
        {/* ---------------------------------------------------------------- READING MODE
            Title, the status and the two dates read-only, the notes as prose, and 编辑. Nothing
            on this screen changes the task, which is the whole point:
            「编辑和信息显示在同一个地方，容易误触」. Saving returns HERE rather than closing the
            pane -- reading back what was just written is the next thing a person does. */}
        {!editing && (
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  {/* A chip, never alone: the project's NAME is beside it (WCAG 1.4.1). */}
                  <span
                    aria-hidden="true"
                    className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(task.projectId)}`}
                  />
                  <span className="truncate text-sm text-fg-muted">{projectName}</span>
                </div>
                {/* 「编辑」 and not 「编辑任务」: accessible names share one flat namespace and are
                    matched by substring, and the guard's 继续编辑 already contains 编辑 -- a longer
                    name here would only add a second way for the two to collide. */}
                <div className="-mt-1 flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={startEditing}
                    className="h-9 rounded-lg border border-border-strong px-3 text-sm text-fg hover:bg-surface-hover"
                  >
                    编辑
                  </button>
                  <CloseButton onClick={requestClose} />
                </div>
              </div>
              {/* The task's name, at the top of the pane's type scale: the pane opens with the
                  TASK, exactly as the editing form does. */}
              <h2 data-detail-title className="mt-0.5 text-lg font-semibold text-fg">
                {task.title}
              </h2>
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span className={label}>状态</span>
                <span aria-hidden="true" className="flex">
                  <StatusMark status={task.status} />
                </span>
                <span className="text-sm text-fg">{STATUS_LABEL[task.status]}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-sm text-deadline">
                  <DeadlineMark filled={false} />
                  截止
                </span>
                <span className={`text-sm tabular-nums ${dueOverdue ? 'text-missed' : 'text-fg'}`}>
                  {dueReading ?? '没有设定'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-sm text-plan">
                  <PlanMark />
                  排期
                </span>
                <span className="text-sm tabular-nums text-fg">{planReading ?? '没有设定'}</span>
              </div>
            </div>

            <div>
              <span className={label}>备注</span>
              {/* THE NOTE, RENDERED AS MARKDOWN (D73). Kept at the 68ch reading measure the
                  textarea has always had, because that is where prose wants to wrap and because the
                  pane's own layout and scroll must not move when a note contains a table or a
                  diagram. `NoteBody`'s fallback is the plain `whitespace-pre-wrap` paragraph this
                  used to be, so the words are on screen before the renderer has even loaded. */}
              {task.notes ? (
                <div data-detail-notes className="mt-1 max-w-[68ch] text-fg">
                  <NoteBody source={task.notes} />
                </div>
              ) : (
                <p className="mt-1 text-sm text-fg-subtle">还没有备注</p>
              )}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- EDITING MODE */}
        {editing && (
          <form
            // `handleSubmit` is what refuses an invalid form, and what it validates against is the
            // UPDATE CONTRACT: the empty-title rule is `updateTaskBody`'s `.trim().min(1)`, not a
            // second copy of it written here.
            onSubmit={handleSubmit((values) => {
              if (save.isPending) return
              // After the lists have refetched, so the row behind the panel is already up to date.
              save.mutate(
                { values, changed: new Set(Object.keys(dirtyFields)) },
                {
                  onSuccess: () => {
                    // SAVING DOES NOT CLOSE THE PANE. It drops back to reading mode, where the
                    // values that were just written are on screen to be read back -- which is
                    // what a person wants to do immediately after writing them. `onSaved` still
                    // marks the row behind; what it no longer does is take the pane with it.
                    // `getValues()`, not the submitted `values`: those are the RESOLVER'S
                    // OUTPUT (`dueAt` an ISO instant, say) while the form holds the input shape
                    // (a `datetime-local` string). Resetting to the output left every such field
                    // looking changed, so the form stayed dirty, so the router's leave guard
                    // blocked the next navigation -- a pane that had just been saved cleanly
                    // refused to let the page move.
                    reset(getValues())
                    setEditing(false)
                    // The control that was pressed no longer exists, so focus has to be put
                    // somewhere deliberately: the panel, which is where it was when the pane
                    // opened and which is what listens for Escape. Without this it falls to
                    // <body> and the pane stops answering the keyboard entirely (WCAG 2.4.3).
                    queueMicrotask(() => panel.current?.focus())
                    onSaved()
                  },
                },
              )
            })}
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
                  className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(nextProjectId)}`}
                />
                <select
                  aria-label="项目"
                  {...register('projectId')}
                  className="-ml-0.5 max-w-full rounded-lg bg-transparent py-0.5 text-sm text-fg-muted hover:text-fg"
                >
                  {(projects.data ?? [])
                    .filter((p) => !p.archivedAt || p.id === task.projectId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <span className="-mt-1 ml-auto shrink-0">
                  <CloseButton onClick={requestClose} />
                </span>
              </div>
              <input
                {...titleRest}
                // Two refs on one element: the library's, and the pane's own -- 编辑 hands focus to
                // this field, and the control the press destroyed must not take focus to <body>.
                ref={(el) => {
                  registerTitle(el)
                  titleField.current = el
                }}
                aria-label="标题"
                className="mt-0.5 w-full rounded-lg bg-transparent py-0.5 text-lg font-semibold text-fg"
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
                    className="relative flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border-subtle py-1 pr-2 pl-1.5 text-sm text-fg-muted hover:bg-surface has-[:checked]:border-border-strong has-[:checked]:bg-surface has-[:checked]:font-semibold has-[:checked]:text-fg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                  >
                    <input
                      type="radio"
                      value={s}
                      {...register('status')}
                      // The real control, covering the whole chip rather than hidden off-screen:
                      // the chip IS the radio, so a press anywhere on it is a press on the input
                      // and the keyboard gets the native radiogroup for nothing.
                      className="absolute inset-0 cursor-pointer appearance-none opacity-0"
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
              <label htmlFor="detail-due" className="flex items-center gap-1 text-sm text-deadline">
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
                <button
                  type="button"
                  onClick={() => setValue('dueAt', null, { shouldDirty: true })}
                  className={decision}
                >
                  清除截止
                </button>
              </div>
              {/* A `Controller`, not `register`: the form holds the INSTANT the contract takes while
                  this control's value is bare wall-clock text with no zone in it, so the two are
                  different representations of one field and something has to convert between them.
                  `fromDayTimeInput`/`toDayTimeInput` do it in the account's zone -- the same zone
                  the reading line, the row and the server all use. */}
              <Controller
                name="dueAt"
                control={control}
                render={({ field }) => (
                  <input
                    id="detail-due"
                    type="datetime-local"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={toDayTimeInput(field.value ?? null, timeZone)}
                    onChange={(e) => field.onChange(fromDayTimeInput(e.target.value, timeZone))}
                    className={`${exact} mt-1.5`}
                  />
                )}
              />
              <DateEcho text={dueEcho} />
            </div>

            <div>
              <label htmlFor="detail-plan" className="flex items-center gap-1 text-sm text-plan">
                <PlanMark />
                排期
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {DAYS.map(([word, day]) => (
                  <button
                    key={word}
                    type="button"
                    onClick={() => setValue('scheduledOn', day, { shouldDirty: true })}
                    className={decision}
                  >
                    排到{word}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setValue('scheduledOn', null, { shouldDirty: true })}
                  className={decision}
                >
                  清除排期
                </button>
              </div>
              <input
                id="detail-plan"
                type="date"
                // An empty date input yields '', and the contract takes a day or null. Sending ''
                // would be rejected; silently coercing it to today would be worse.
                {...register('scheduledOn', {
                  setValueAs: (v: unknown) => (typeof v === 'string' && v !== '' ? v : null),
                })}
                className={`${exact} mt-1.5`}
              />
              <DateEcho text={planEcho} />
            </div>

            {/* `htmlFor` rather than a label WRAPPING the textarea, like the two dates above it.
                A wrapping label's text is its whole subtree, and React writes a textarea's value
                into the element's text, so the field's label read 「备注」 plus whatever had been
                typed -- which made the name unmatchable as a whole string, and a substring match
                for 备注 collides with the row's own 「有备注」 mark on this very page. */}
            <div>
              <div className="flex items-end justify-between gap-2">
                <label htmlFor="detail-notes" className={label}>
                  备注
                </label>
                {/* 「全屏写作」 -- a name that collides with nothing in the app's one flat
                    namespace (编辑 / 继续编辑 / 保存 / 取消 are the pane's others). The pane is
                    22rem wide: this is the way out for a note that is a page rather than a line. */}
                <button
                  type="button"
                  onClick={() => setWriting(true)}
                  className="-mb-0.5 h-7 rounded-md border border-border-subtle px-2 text-xs text-fg-muted hover:border-border-strong hover:text-fg"
                >
                  全屏写作
                </button>
              </div>
              {/* The one place in the app that keeps a READING measure: notes are prose, and
                68ch is where prose wants to wrap. Nothing else does, which is the whole point
                of the redesign -- a list is scanned, not read. */}
              <textarea
                id="detail-notes"
                // Empty notes are null, not '': the contract's `notes` is nullable, and a PATCH
                // clearing them has to say null.
                {...register('notes', {
                  setValueAs: (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null),
                })}
                rows={5}
                className={`${field} mt-1.5 max-w-[68ch]`}
              />
            </div>
            {writing && (
              <WritingMode
                heading={title?.trim() || '备注'}
                source={notesSource ?? ''}
                // Empty notes are null, not '' -- the same rule the field's own `setValueAs` keeps,
                // because the contract's `notes` is nullable and a PATCH that clears them says null.
                onChange={(next) =>
                  setValue('notes', next.trim() === '' ? null : next, { shouldDirty: true })
                }
                onClose={() => setWriting(false)}
              />
            )}
            {asking && (
              <div role="alert" className="rounded-lg border border-border-strong p-3 text-sm">
                <p className="text-fg">
                  {leaving
                    ? '有未保存的修改，离开会丢掉它们。'
                    : '有未保存的修改，关闭会丢掉它们。'}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    ref={keepEditing}
                    type="button"
                    onClick={keepEditingNow}
                    className="h-9 rounded-lg bg-accent px-3 font-semibold text-accent-fg hover:opacity-90"
                  >
                    继续编辑
                  </button>
                  <button
                    type="button"
                    onClick={discard}
                    className="h-9 rounded-lg border border-border-strong px-3 text-fg hover:bg-surface-hover"
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
                disabled={save.isPending || !title?.trim()}
                className="h-10 rounded-lg bg-accent px-4 font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => leave(stopEditing)}
                className="h-10 rounded-lg border border-border-strong px-4 text-fg hover:bg-surface-hover"
              >
                取消
              </button>
            </div>
            {/* Destroying the task is not a peer of saving it. It sits below the rule, at the size
              of a footnote, where nothing lands on it by accident on the way to 保存. */}
            <div className="mt-2 border-t border-border-subtle pt-3">
              <button
                ref={deleteButton}
                type="button"
                onClick={askDelete}
                className="-mx-2 rounded-lg px-2 py-1 text-sm text-fg-muted hover:text-danger"
              >
                删除任务
              </button>
            </div>
            {deleting && (
              <DeleteConfirm
                label="确认删除任务"
                className="-mt-3 rounded-lg border border-border-strong p-3"
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
        )}
      </div>
    </>
  )
}

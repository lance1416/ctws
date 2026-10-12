import {
  TASK_STATUSES,
  type TaskResponse,
  type TaskStatus,
  type UpdateTaskBody,
} from '@ctws/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { DangerAction, DangerZone } from './DangerZone'
import { DetailPane } from './DetailPane'
import { PickOne } from './inline'
import { Dependencies } from './Dependencies'
import { LinkedSection } from './Links'
import { BUTTON } from './buttonStyles'
// The shared editing vocabulary, which the New task dialog types into a task with as well.
import { decision, field, label, STATUS_CHIP } from './formStyles'
import { useUnsavedGuard } from './unsavedGuard'
import { DeadlineMark, PlanMark } from './RowParts'
import { StatusMark } from './StatusMark'
import { StatusPicker } from './StatusPicker'
import { STATUS_LABEL } from './statusLabel'
import { detailTaskForm, PATCH_KEYS, type DetailTaskForm, type DetailTaskValues } from './taskForm'
import { useTimeZone } from '../useMe'
import { useForgetRecent, useRecordRecent } from '../recent'

/**
 * The exact field, for the days the three named decisions do not cover. Quieter than them on
 * purpose -- it is the fallback, and a full-width boxed input made the rarer route the loudest
 * thing in the block -- but quieter by SIZE, not by a fainter edge: an input's edge is what says
 * "this is a control", so it keeps `border-strong` (styles.css: border-subtle is decorative only).
 */
const exact =
  'h-9 w-full max-w-[14rem] rounded-lg border border-rule-strong bg-sheet px-2 text-sm text-ink'

/**
 * The exact local day and time, said the way the rest of the app says it ("Tomorrow, 14:30"),
 * under the native date control.
 *
 * It is here because a native date input renders its format in the BROWSER'S UI language, which
 * the page cannot set (not through `lang`, not through the JS locale -- verified), so the field
 * itself may read `dd/mm/yyyy` on one machine and `yyyy/mm/dd` on another. The echo is the app
 * saying back, in its own words, which day it understood -- which is the thing the reader actually
 * needs, and it is right whatever the field prints.
 */
function DateEcho({ text }: { text: string | null }) {
  if (!text) return null
  return <p className="mt-1 text-xs tabular-nums text-ink-muted">{text}</p>
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
 * An icon and not the word “Close”: a text button of that size sits in the control row as a peer
 * of Edit and Save, which reads as though closing were something you DO to the task. Every panel
 * of this shape -- Linear's peek, Notion's side peek -- puts a small ✕ in the corner and leaves
 * Escape as the real shortcut. `aria-label` carries the word for anyone who needs it.
 */
function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      data-detail-close
      className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-hover hover:text-ink"
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
  useRecordRecent({
    type: 'task',
    id: task.id,
    title: task.title,
    to: `/projects/${projectId}?reveal=${task.id}`,
    kind: 'Task',
  })
  /**
   * THE ACCOUNT'S ZONE, for every day and clock on this panel -- including the exact
   * `datetime-local` field, whose value is bare wall-clock text with no zone in it. Reading that
   * field as the BROWSER's wall clock is what made the pane a third notion of "today" beside the
   * row's and the server's; it now means the same zone as both.
   */
  const timeZone = useTimeZone()
  /**
   * The pane's BODY, for putting focus back on it. The frame is the shell's (`DetailPane`): this
   * is the thing inside it that a cancelled edit returns to, rather than <body> (WCAG 2.4.3).
   */
  const panel = useRef<HTMLDivElement>(null)
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
   * READING MODE IS THE DEFAULT: everything about the task is on the first screen, and nothing on
   * it can be changed by a mis-aimed click.
   *
   * Looking something up costs nothing and risks nothing, because there is not one control on
   * screen that can change a value. The editing controls are all behind Edit, which is also where
   * the notes render Markdown from.
   *
   * It is NOT autosave. An explicit Save and the unsaved-edit guard (close, navigate, log out)
   * still apply; this only decides whether the controls they guard are on screen yet.
   */
  const [editing, setEditing] = useState(false)
  const titleField = useRef<HTMLInputElement | null>(null)
  const { ref: registerTitle, ...titleRest } = register('title')
  const startEditing = () => {
    setEditing(true)
    // The first field, not the panel: Edit is a request to type, and the control the press
    // destroyed must not take focus to <body> with it (WCAG 2.4.3).
    queueMicrotask(() => titleField.current?.focus())
  }

  /**
   * THE FULL-SCREEN WRITING MODE (artboard H) -- the escape hatch of editing model A.
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
  const [descendants, setDescendants] = useState<number | null>(null)
  const countDescendants = async () => {
    setDescendants(null)
    try {
      const all = await qc.fetchQuery({
        queryKey: tasksKey(task.projectId),
        queryFn: () => listProjectTasks(task.projectId),
        staleTime: 0,
      })
      let count = 0
      let frontier = [task.id]
      while (frontier.length > 0) {
        const kids = all.tasks.filter((t) => t.parentId !== null && frontier.includes(t.parentId))
        count += kids.length
        frontier = kids.map((t) => t.id)
      }
      setDescendants(count)
    } catch {
      // Without the count the person would be confirming blind; say so and let them cancel.
      setDescendants(-1)
    }
  }
  const forget = useForgetRecent()
  const remove = useMutation({
    mutationFn: () => deleteTask(task.id),
    onSuccess: () => forget('task', task.id),
    // Settled, not success: a failed delete may still have changed what the lists should show.
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ['today'] })
      await qc.invalidateQueries({ queryKey: ['completed'] })
      await qc.invalidateQueries({ queryKey: ['movement'] })
      await qc.invalidateQueries({ queryKey: tasksKey(task.projectId) })
    },
  })

  // The named decisions, the same three days the row's triage control offers (today, tomorrow,
  // next week)
  // plus the way out. They write the SAME fields the exact inputs write and are saved by the same
  // Save press -- they are a faster way to type a date, not a second way to change the task.
  const todayYmd = todayIn(timeZone)
  const DAYS: [string, string][] = [
    ['Today', todayYmd],
    ['Tomorrow', addDays(todayYmd, 1)],
    ['Next week', nextMonday(todayYmd)],
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
  /** An instant in the app's own words: "Tomorrow, 14:30", on the account's calendar and clock. */
  const say = (iso: string) => {
    const [day, clock] = toDayTimeInput(iso, timeZone).split('T') as [string, string]
    return `${dayPhrase(day, todayYmd)}, ${clock}`
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

  /**
   * WHAT EVERY WRITE FROM THIS PANE HAS TO REFRESH.
   *
   * The today list is cross-project and server-derived: any edit can move a task between segments
   * or off the list, so it is always refetched. One copy, because there are two writers now (the
   * form and the status picker) and a second copy is a second chance to forget a list.
   */
  const refreshAfterWrite = async () => {
    await qc.invalidateQueries({ queryKey: ['today'] })
    await qc.invalidateQueries({ queryKey: ['completed'] })
    await qc.invalidateQueries({ queryKey: ['movement'] })
    await qc.invalidateQueries({ queryKey: tasksKey(projectId) })
    if (nextProjectId !== projectId)
      await qc.invalidateQueries({ queryKey: tasksKey(nextProjectId) })
  }

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
       * ONLY WHAT CHANGED, and the library is what knows it. A hand-written `if (x !== task.x)`
       * per field is six chances to forget one, and six comparisons against the LIVE `task` while
       * `dirty` reads the mount-time snapshot: a background refetch of a field nobody touched
       * would then send the stale local value back and undo the other edit. One notion of dirty,
       * and it is `dirtyFields`.
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
    onSettled: refreshAfterWrite,
  })

  /**
   * THE DIRECT STATUS WRITE. It lands at once, and the refetch set is the SAME one the
   * form's save uses -- a status change moves a task between today's segments, on and off Done,
   * and through the project's counts.
   *
   * It is outside the leave guard on purpose: nothing here is ever unsaved.
   */
  const setStatus = useMutation({
    mutationFn: (status: TaskStatus) => patchTask(task.id, { status }),
    onSettled: refreshAfterWrite,
  })

  /**
   * LEAVING WITH UNSAVED EDITS asks first, and `unsavedGuard` owns every way out of the pane.
   *
   * A save that is in flight (or has landed, with the panel about to close) loses nothing, so it
   * must not trap the person who pressed Save and then, at once, a nav link. NOT
   * `&& !save.isSuccess`: the pane stays open after a save, so that flag would stay true for the
   * rest of its life and the guard would never fire again -- a second round of edits would walk
   * away unprotected. The save clears the form's own dirty state (`reset`) instead, which is the
   * honest signal.
   */
  const unsaved = dirty && !save.isPending
  const guard = useUnsavedGuard(unsaved, onClose)
  /**
   * A QUESTION NOBODY CAN SEE IS NOT A GUARD. The discard prompt renders inside the pane's form, and
   * the writing mode is a full-screen layer over it -- so when the guard has something to ask (the
   * browser's back button is the way out of a layer that covers the whole window), the layer stands
   * down first and the question is on screen where the answer has to be given.
   */
  useEffect(() => {
    if (guard.asking) setWriting(false)
  }, [guard.asking])
  const stopEditing = () => {
    reset()
    setEditing(false)
    // Back to the control the press came from, not to <body> (WCAG 2.4.3).
    queueMicrotask(() => panel.current?.focus())
  }
  const requestClose = () => guard.leave(onClose)

  /**
   * ESCAPE UNWINDS ONE LEVEL. The pane is the outermost of them and the shell closes it, so this
   * handles only the levels INSIDE it and says so with `preventDefault` -- an unhandled press
   * travels on to `DetailPane`, which closes.
   */
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    // The delete question is a level of its own and backs itself out; it says so the same way.
    if (e.defaultPrevented) return
    // A second Escape on the discard prompt means "keep editing".
    if (guard.asking) guard.keep()
    // Out of editing into reading, and only then out of the pane.
    else if (editing) guard.leave(stopEditing)
    else return
    e.preventDefault()
  }

  return (
    <DetailPane label="Task details" onClose={requestClose}>
      {/* `flex-1 flex-col`: the pane's height reaches down through this box to `DangerZone`, which
          needs a floor to be pushed to. */}
      <div
        ref={panel}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex flex-1 flex-col focus:outline-none"
      >
        {/* ---------------------------------------------------------------- READING MODE
            Title, the status and the two dates read-only, the notes as prose, and Edit. Nothing
            on this screen changes the task, which is the whole point:
            "editing and reading in one place is too easy to hit by mistake". Saving returns HERE rather than closing the
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
                  <span className="truncate text-sm text-ink-muted">{projectName}</span>
                </div>
                {/* “Edit” and not “Edit task”: accessible names share one flat namespace and are
                    matched by substring, and the guard's “Keep editing” already contains it -- a longer
                    name here would only add a second way for the two to collide. */}
                <div className="-mt-1 flex shrink-0 items-center gap-1">
                  <button type="button" onClick={startEditing} className={BUTTON.secondary}>
                    Edit
                  </button>
                  <CloseButton onClick={requestClose} />
                </div>
              </div>
              {/* The task's name, at the top of the pane's type scale: the pane opens with the
                  TASK, exactly as the editing form does. */}
              <h2 data-detail-title className="mt-0.5 text-lg font-semibold text-ink">
                {task.title}
              </h2>
            </div>

            <div className="flex flex-col gap-2.5">
              {/* THE STATUS IS CHANGED HERE. One value out of five is a decision, not a
                  composition: there is nothing for a Save to mean, so there is none. The menu is
                  what keeps it deliberate -- the old read/edit split was answering "too easy to hit by mistake",
                  and a control you have to open answers it at a third of the cost. */}
              <div className="flex items-center gap-2">
                <span className={label}>Status</span>
                <StatusPicker
                  status={task.status}
                  disabled={setStatus.isPending}
                  onPick={(next) => setStatus.mutate(next)}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-sm text-deadline">
                  <DeadlineMark filled={false} />
                  Due
                </span>
                <span className={`text-sm tabular-nums ${dueOverdue ? 'text-missed' : 'text-ink'}`}>
                  {dueReading ?? 'Not set'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-sm text-plan">
                  <PlanMark />
                  Plan
                </span>
                <span className="text-sm tabular-nums text-ink">{planReading ?? 'Not set'}</span>
              </div>
            </div>

            {/* WHAT HAS TO HAPPEN FIRST. It lives in READING mode and not in the form:
                an edge is a fact about two tasks that is written the moment it is named, and
                parking it behind Save would make adding a dependency wait on a form it is not part of. */}
            <Dependencies taskId={task.id} projectId={task.projectId} />

            <div>
              <span className={label}>Notes</span>
              {/* THE NOTE, RENDERED AS MARKDOWN. Kept at the 68ch reading measure the
                  textarea has always had, because that is where prose wants to wrap and because the
                  pane's own layout and scroll must not move when a note contains a table or a
                  diagram. `NoteBody`'s fallback is the plain `whitespace-pre-wrap` paragraph this
                  used to be, so the words are on screen before the renderer has even loaded. */}
              {task.notes ? (
                <div data-detail-notes className="mt-1 max-w-[68ch] text-ink">
                  <NoteBody source={task.notes} />
                </div>
              ) : (
                <p className="mt-1 text-sm text-ink-subtle">No notes yet</p>
              )}
            </div>

            {/*
              AND WHO OR WHAT IT IS ABOUT: 「这个活要跟陈颖对接」「这本书是她推荐的」。

              边早就收得下这些（`about` 两端都不限），缺的只是任务这一侧没把它画出来 —— 于是一件
              活和一个人之间的那句话，只有 curl 写得进去。和依赖一样住在阅读态：说出一条边的那一
              刻它就成立，不该等一张它不属于的表单。

              排在笔记后面，和一个人、一场会、一本书的那一层同一个位置：这个东西自己的字段在上，
              它连着什么在下，最底下才是删除。

              项目不在这里重复：面板抬头那一行写的就是它，而一行东西读两遍是这个 app 一直在躲的那件事。
            */}
            <LinkedSection of={{ type: 'task', id: task.id }} except={['project']} />
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
                    // what a person wants to do immediately after writing them. `onSaved` marks
                    // the row behind and leaves the pane open.
                    // `getValues()`, not the submitted `values`: those are the RESOLVER'S
                    // OUTPUT (`dueAt` an ISO instant, say) while the form holds the input shape
                    // (a `datetime-local` string). Resetting to the output leaves every such
                    // field looking changed, so the form stays dirty and the router's leave
                    // guard blocks the next navigation out of a cleanly saved pane.
                    reset(getValues())
                    setEditing(false)
                    // The control that was pressed is gone, so focus has to be put somewhere
                    // deliberately: the panel, which is where it was when the pane
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
              open with the word Title over an input, which made a task read as a settings form.
              The project is the identity line AND the control that moves it -- one thing, not a
              breadcrumb at the top and a duplicate dropdown at the bottom. The chip beside it is
              never alone: the project's NAME is right there (WCAG 1.4.1). */}
            <div>
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(nextProjectId)}`}
                />
                {/* The app's own picker, not a native `<select>`: the OS draws that popup and
                    does not know this palette. */}
                <PickOne
                  label="Projects"
                  value={nextProjectId}
                  choices={(projects.data ?? [])
                    .filter((p) => !p.archivedAt || p.id === task.projectId)
                    .map((p) => ({ value: p.id, label: p.name }))}
                  onPick={(id) => setValue('projectId', id, { shouldDirty: true })}
                />
                {/* SAVE IS WHERE EDIT WAS, the way the other three panes have it: Cancel, then
                    Save, at the top. It used to be at the foot of the form, Save first, so a long
                    note pushed it off the screen and a person had to learn two layouts. */}
                <span className="-mt-1 ml-auto flex shrink-0 items-center gap-1">
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => guard.leave(stopEditing)}
                      className={BUTTON.secondary}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={save.isPending || !title?.trim()}
                      className={BUTTON.primary}
                    >
                      Save
                    </button>
                  </span>
                  <CloseButton onClick={requestClose} />
                </span>
              </div>
              <input
                {...titleRest}
                // Two refs on one element: the library's, and the pane's own -- Edit hands focus
                // to this field, and the control the press destroyed must not take focus to <body>.
                ref={(el) => {
                  registerTitle(el)
                  titleField.current = el
                }}
                aria-label="Title"
                className="mt-0.5 w-full rounded-lg bg-transparent py-0.5 text-lg font-semibold text-ink"
              />
            </div>

            {/* Under the buttons that raised them, not at the foot of the form: a Cancel pressed
                at the top must not ask its question somewhere below a long note. */}
            {guard.asking && (
              <div role="alert" className="rounded-lg border border-rule-strong p-3 text-sm">
                <p className="text-ink">
                  {guard.leaving
                    ? 'You have unsaved changes. Leaving will discard them.'
                    : 'You have unsaved changes. Closing will discard them.'}
                </p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={guard.discard} className={BUTTON.secondary}>
                    Discard changes
                  </button>
                  <button
                    ref={guard.focusOn}
                    type="button"
                    onClick={guard.keep}
                    className={BUTTON.primary}
                  >
                    Keep editing
                  </button>
                </div>
              </div>
            )}
            {save.isError && (
              <p role="alert" className="text-sm text-danger">
                {save.error instanceof Error ? save.error.message : "Couldn't save it"}
              </p>
            )}

            {/* Status speaks the vocabulary the rows speak: the same five marker shapes, named.
              A dropdown of words made the app's core semantic something you had to open a menu
              to read. Native radios on purpose -- the group is one tab stop and the arrow keys
              move within it, for free and correctly. */}
            <div role="radiogroup" aria-labelledby="detail-status-label">
              <span id="detail-status-label" className={label}>
                Status
              </span>
              {/* Sized to the words, wrapped where they run out. A fixed three-column grid cut
                 the longest label in half at this width, and a label that wraps inside its own
                 chip makes that chip taller than its neighbours -- either way the row stops
                 reading as one control. Wrapping lands on 3 + 2 by itself. */}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {TASK_STATUSES.map((s) => (
                  <label key={s} className={STATUS_CHIP}>
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
                      that also announced “In progress” would say it twice. */}
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
              decisions the row's triage control offers -- today / tomorrow / next week and the way out --
              AND an exact field for everything those three do not cover. */}
            <div>
              <label htmlFor="detail-due" className="flex items-center gap-1 text-sm text-deadline">
                <DeadlineMark filled={false} />
                Due
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {DAYS.map(([word, day]) => (
                  <button
                    key={word}
                    type="button"
                    onClick={() => setDueDay(day)}
                    className={decision}
                  >
                    Due {word.toLowerCase()}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setValue('dueAt', null, { shouldDirty: true })}
                  className={decision}
                >
                  Clear the deadline
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
                Plan
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {DAYS.map(([word, day]) => (
                  <button
                    key={word}
                    type="button"
                    onClick={() => setValue('scheduledOn', day, { shouldDirty: true })}
                    className={decision}
                  >
                    Plan for {word.toLowerCase()}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setValue('scheduledOn', null, { shouldDirty: true })}
                  className={decision}
                >
                  Clear the plan
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
                into the element's text, so the field's label read “Notes” plus whatever had been
                typed -- which made the name unmatchable as a whole string, and a substring match
                for Notes collides with the row's own “Has notes” mark on this very page. */}
            <div>
              <div className="flex items-end justify-between gap-2">
                <label htmlFor="detail-notes" className={label}>
                  Notes
                </label>
                {/* “Full screen” -- a name that collides with nothing in the app's one flat
                    namespace (Edit / Keep editing / Save / Cancel are the pane's others). The pane is
                    22rem wide: this is the way out for a note that is a page rather than a line. */}
                <button
                  type="button"
                  onClick={() => setWriting(true)}
                  className="-mb-0.5 h-7 rounded-md border border-rule px-2 text-xs text-ink-muted hover:border-rule-strong hover:text-ink"
                >
                  Full screen
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
                heading={title?.trim() || 'Notes'}
                source={notesSource ?? ''}
                // Empty notes are null, not '' -- the same rule the field's own `setValueAs` keeps,
                // because the contract's `notes` is nullable and a PATCH that clears them says null.
                onChange={(next) =>
                  setValue('notes', next.trim() === '' ? null : next, { shouldDirty: true })
                }
                onClose={() => setWriting(false)}
              />
            )}
          </form>
        )}
        {/*
          LAST ON THIS SURFACE, in READING mode, under a rule, in the danger colour.

          Not inside the form: destroying the task is not a peer of saving it, and a delete you
          can only reach by pressing Edit is a delete nobody finds. Every thing in this app now
          answers the same way -- a person, a meeting, a project -- so the one irreversible
          action is always in the same place: the foot of the thing's own surface, below
          everything, asking once.
        */}
        {!editing && (
          <DangerZone>
            <DangerAction
              label="Delete task"
              confirmLabel="Confirm deleting this task"
              message={
                descendants === null
                  ? null
                  : descendants < 0
                    ? `Delete “${task.title}” and all its subtasks. This cannot be undone.`
                    : descendants === 0
                      ? `Delete “${task.title}”. This cannot be undone.`
                      : `Delete “${task.title}” and its ${descendants} subtasks. This cannot be undone.`
              }
              busy={remove.isPending}
              onAsk={countDescendants}
              onConfirm={() => remove.mutate()}
            />
          </DangerZone>
        )}
        {remove.isError && (
          <p role="alert" className="text-sm text-danger">
            {remove.error instanceof Error ? remove.error.message : "Couldn't delete it"}
          </p>
        )}
      </div>
    </DetailPane>
  )
}

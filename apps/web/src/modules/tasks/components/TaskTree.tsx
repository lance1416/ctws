import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { MoveTaskBody, TaskResponse, TaskStatus } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listProjects } from '../../../shell/projects/api'
import { createTask, listProjectTasks, moveTask, patchTask, type ProjectTasks } from '../api/tasks'
import { refreshTasks, tasksKey } from '../api/taskCache'
import { ancestorsOf } from '../tree/ancestors'
import { flatten } from '../tree/flatten'
import { rollupPhrase } from '../rollupPhrase'
import { loadCollapsed, loadShowDone, saveCollapsed, saveShowDone } from '../tree/collapse'
import { MAX_DEPTH, planDrop, type DropPlan } from '../tree/drop'
import { useTaskActions } from '../api/taskActions'
import { useShortcutsEnabled } from '../../../platform/keyboard/enabled'
import { useForgetRecent } from '../../../shell/search/recent'
import { EMPTY_ACTION, EmptyState } from '../../../platform/ui/EmptyState'
import { SelectionBar } from './SelectionBar'
import { TaskDetail } from './TaskDetail'
import { statusForKey } from './StatusControls'
import { NewTaskInput } from './NewTaskInput'
import { INDENT_PX, ROW_LIST } from '../../../shell/rows/RowParts'
import { LIST_MEASURE } from '../../../shell/rows/leads'
import { TaskRow } from './TaskRow'

/**
 * Optimistic result of a move. The server computes the real rank (spec 8.3), so this only has to
 * put the row where the user dropped it until the refetch replaces it: the siblings of the new
 * parent get stand-in ranks that follow the intended order. They are never sent anywhere.
 */
function applyMove(old: TaskResponse[], id: string, body: MoveTaskBody): TaskResponse[] {
  const moved = old.find((t) => t.id === id)
  if (!moved) return old
  const siblings = old
    .filter((t) => t.parentId === body.parentId && t.id !== id)
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id < b.id ? -1 : 1))
  let at = siblings.length
  if (body.beforeId)
    at = Math.max(
      siblings.findIndex((t) => t.id === body.beforeId),
      0,
    )
  else if (body.afterId) at = siblings.findIndex((t) => t.id === body.afterId) + 1
  const ordered = [...siblings.slice(0, at), moved, ...siblings.slice(at)]
  const rankOf = new Map(ordered.map((t, i) => [t.id, String(i).padStart(8, '0')]))
  return old.map((t) =>
    t.id === id
      ? { ...t, parentId: body.parentId, rank: rankOf.get(id)! }
      : rankOf.has(t.id)
        ? { ...t, rank: rankOf.get(t.id)! }
        : t,
  )
}

export function TaskTree({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const allProjects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  // Only the INBOX dates its rows. Quick capture makes the inbox the one list that grows
  // without anyone deciding anything, so "how long has this been sitting here" is the question
  // it raises and no other project does; and since most rows in an ordinary tree carry no date
  // at all, putting an age on them would give every one of them a second line.
  const inInbox = allProjects.data?.find((p) => p.id === projectId)?.isInbox === true
  const key = tasksKey(projectId)
  const [collapsed, setCollapsed] = useState(() => loadCollapsed(projectId))
  const [showDone, setShowDone] = useState(() => loadShowDone(projectId))
  /**
   * Rows finished RIGHT HERE, which stay on screen even while finished rows are hidden.
   *
   * Without this, pressing x on a focused row deletes it from under the cursor: the mark never
   * gets to show it worked, the focus has nowhere to go, and the second x that undoes a mis-press
   * has no row to land on. What the hiding is for is the BACKLOG of things finished days ago, not the
   * thing finished a second ago. The set lives only as long as this mount, so the row is gone on
   * the next load -- which is also when the person has stopped looking at it.
   */
  const [keptFinished, setKeptFinished] = useState<ReadonlySet<string>>(() => new Set())
  /**
   * The rows Shift+click has picked. A set of ids and nothing else: it is not persisted,
   * and anything that leaves the tree -- a navigation, a refetch that drops a row -- simply
   * stops matching, so there is no stale selection to clean up.
   */
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // SEPARATE FROM `error` ON PURPOSE. A failed creation is about one input that is on
  // screen, so it is said next to that input; everything else here -- a refused move, a depth
  // limit -- has no single row to sit beside and stays in the banner above the tree.
  const [createError, setCreateError] = useState<string | null>(null)
  /**
   * THE OPEN TASK IS IN THE ADDRESS, as `?task=<id>`: a task has no page of its own, so its
   * address is its project's page with its sheet open. A reload opens it again, a link to it lands
   * on it, and Back steps out of it -- opening and closing are each a step in the history, so the
   * sheet you just closed is one Back away.
   */
  const [taskParams, setTaskParams] = useSearchParams()
  const openId = taskParams.get('task')
  const setOpenId = (id: string | null, { replace = false }: { replace?: boolean } = {}) =>
    setTaskParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('task', id)
        else next.delete('task')
        return next
      },
      { replace },
    )
  // Where an inline create input is showing: the parent whose children it appends to (null is
  // the root level) and the row whose handle gets focus back when it is cancelled. The server
  // appends a new task to the END of its parent's children, so that is where the input sits.
  const [adding, setAdding] = useState<{ parentId: string | null; from: string } | null>(null)
  const inFlight = useRef(false)
  // Which row holds the tree's single tab stop. It follows focus, so Tab re-enters the tree at
  // the row the person last used instead of jumping back to the top (the roving tabindex).
  const [activeId, setActiveId] = useState<string | null>(null)
  const singleKeys = useShortcutsEnabled()

  // The cache holds exactly what listProjectTasks returns; the rows are derived, never cached.
  const tasks = useQuery({ queryKey: key, queryFn: () => listProjectTasks(projectId) })
  /**
   * WHAT IS LEFT TO DO. A finished row leaves the tree unless the person asks for it back.
   *
   * The rule has one exception, and it is the tree's oldest rule: a list that loses tasks cannot
   * be trusted. A finished PARENT with unfinished children stays -- hiding it would take its
   * children with it, which is precisely losing tasks. It is dimmed instead, by `TaskRow`'s own
   * finished styling, and the unfinished work under it is still reachable.
   */
  const visible = useMemo(() => {
    const all = tasks.data?.tasks ?? []
    if (showDone) return all
    const index = new Map(all.map((t) => [t.id, t]))
    const live = new Set<string>()
    for (const t of all) {
      if (t.status === 'done' || t.status === 'cancelled') continue
      // Walk up marking ancestors: an unfinished task keeps every parent above it on screen.
      // `live.has` stops the walk, so each chain is climbed once and the whole pass is O(n).
      for (let at = t as TaskResponse | undefined; at && !live.has(at.id);) {
        live.add(at.id)
        at = at.parentId === null ? undefined : index.get(at.parentId)
      }
    }
    return all.filter((t) => live.has(t.id) || keptFinished.has(t.id))
  }, [tasks.data, showDone, keptFinished])
  const hiddenDone = (tasks.data?.tasks.length ?? 0) - visible.length
  const rows = useMemo(() => flatten(visible, collapsed), [visible, collapsed])
  // Looked up by id each render, so a task that has left this project (moved away) closes itself.
  const openTask = tasks.data?.tasks.find((t) => t.id === openId)
  const byId = useMemo(() => new Map((tasks.data?.tasks ?? []).map((t) => [t.id, t])), [tasks.data])
  // Falls back to the first row: the remembered row may have been deleted, moved to another
  // project, or folded out of sight, and a tree whose only tab stop does not exist is a tree the
  // keyboard cannot reach at all.
  const tabId = rows.some((r) => r.id === activeId) ? activeId : (rows[0]?.id ?? null)

  const focusRow = (index: number) => {
    const row = rows[index]
    if (!row) return
    document.querySelector<HTMLElement>(`[data-handle-id="${row.id}"]`)?.focus()
  }
  // The row that just saved from the panel: it says so for a moment, since the panel is gone.
  const [savedId, setSavedId] = useState<string | null>(null)
  useEffect(() => {
    if (!savedId) return
    const timer = setTimeout(() => setSavedId(null), 2000)
    return () => clearTimeout(timer)
  }, [savedId])
  const actions = useTaskActions(setError)

  // Distance, so a plain click on the handle (to focus it) is not mistaken for a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const move = useMutation({
    mutationFn: ({ id, body }: { id: string; body: MoveTaskBody; unfolded?: string }) =>
      moveTask(id, body),
    onMutate: async ({ id, body, unfolded }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<ProjectTasks>(key)
      // Only the rows move optimistically. The ROLLUPS are the server's arithmetic over the whole
      // subtree and are left as they are until the refetch: re-deriving them here would be a
      // second implementation of the rollup living in the browser, free to disagree with the first.
      qc.setQueryData<ProjectTasks>(key, (old) =>
        old ? { ...old, tasks: applyMove(old.tasks, id, body) } : old,
      )
      return { previous, unfolded }
    },
    onError: (error, _vars, context) => {
      // Without this the UI keeps a state the database does not contain, and the user believes
      // the move succeeded until the next reload. See Review Focus 5.
      if (context?.previous) qc.setQueryData(key, context.previous)
      // AND THE FOLD GOES BACK TOO. The drop unfolded the destination so the row would be
      // on screen where it landed; if the move was refused, nothing landed there and the parent
      // is left standing open for no reason -- the one visible trace of an action that did not
      // happen. It was argued as acceptable because the user can re-fold it; they should not
      // have to undo something the app did on their behalf and then undid behind their back.
      if (context?.unfolded) {
        const back = new Set(collapsed)
        back.add(context.unfolded)
        setCollapsed(back)
        saveCollapsed(projectId, back)
      }
      setError(error instanceof Error ? error.message : "Couldn't move it")
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const run = (draggedId: string, slot: number, wantedDepth: number) => {
    if (slot < 0 || slot > rows.length) return
    const plan: DropPlan = planDrop({ rows, draggedId, slot, wantedDepth })
    // A refused plan means do nothing: never send a move the plan refused.
    if (!plan.ok) {
      if (plan.reason === 'own-subtree') setError('A task cannot move inside itself')
      else if (plan.reason === 'too-deep') setError('Too deep to move it there')
      return
    }
    setError(null)
    // The gesture is legal and the intent clear, so show the result: a row moved under a folded
    // parent would otherwise vanish from the screen while sitting in the database. Which parent
    // was opened travels with the mutation, so a refusal can put it back.
    let unfolded: string | undefined
    if (plan.parentId && collapsed.has(plan.parentId)) {
      const next = new Set(collapsed)
      next.delete(plan.parentId)
      setCollapsed(next)
      saveCollapsed(projectId, next)
      unfolded = plan.parentId
    }
    const body: MoveTaskBody = { projectId, parentId: plan.parentId }
    if (plan.beforeId) body.beforeId = plan.beforeId
    if (plan.afterId) body.afterId = plan.afterId
    move.mutate({ id: draggedId, body, ...(unfolded ? { unfolded } : {}) })
  }

  const blockLength = (index: number) => {
    let end = index + 1
    while (end < rows.length && rows[end]!.depth > rows[index]!.depth) end++
    return end - index
  }

  // Opens the inline input at the end of `parentId`'s children, unfolding that parent first so
  // the input (and what it creates) is on screen.
  const startAdd = (parentId: string | null, from: string) => {
    if (parentId && collapsed.has(parentId)) {
      const next = new Set(collapsed)
      next.delete(parentId)
      setCollapsed(next)
      saveCollapsed(projectId, next)
    }
    setError(null)
    setCreateError(null)
    setAdding({ parentId, from })
  }

  const addChild = (row: (typeof rows)[number]) => {
    if (row.depth >= MAX_DEPTH) setError('Too deep to add a subtask here')
    else startAdd(row.id, row.id)
  }

  const commitAdd = async (title: string) => {
    if (!adding || inFlight.current) return false
    inFlight.current = true
    try {
      await createTask({ projectId, title, parentId: adding.parentId })
      await refreshTasks(qc, projectId)
      setCreateError(null)
      return true
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Couldn't create. Press Enter to try again.")
      return false
    } finally {
      inFlight.current = false
    }
  }

  const cancelAdd = (restoreFocus: boolean) => {
    const from = adding?.from
    setAdding(null)
    if (restoreFocus && from)
      queueMicrotask(() =>
        document.querySelector<HTMLElement>(`[data-handle-id="${from}"]`)?.focus(),
      )
  }

  /**
   * How plain arrows coexist with the Alt-modified pair: **the modifier is the whole
   * distinction.** Bare `↑/↓` (and `j`/`k`) move the FOCUS between rows; `Alt+↑/↓` move the
   * ROW itself, exactly as before. Bare `←/→` fold and unfold (the ARIA treeview behaviour);
   * `Alt+←/→` change the depth, exactly as before. Nothing is ambiguous because the two sets
   * are disjoint on `altKey`, and the Alt branches are tested first.
   *
   * Tab remains bound to nothing at all. It was a keyboard trap here once (WCAG 2.1.2) and the
   * roving tabindex is what makes a single Tab leave the tree instead of visiting every row.
   */
  /**
   * Every status change the TREE makes goes through here, so finishing a row keeps it on screen
   * whichever way it was finished -- the mark, or `x` on a focused row. Two call sites wrote the
   * same two lines before; one of them forgot the keeping and the keyboard lost its own row.
   */
  const setStatus = (id: string, status: TaskStatus) => {
    setError(null)
    if (status === 'done' || status === 'cancelled')
      setKeptFinished((prev) => new Set(prev).add(id))
    actions.setStatus(id, status)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const row = rows[index]!
    // Bare, with no Shift either: Shift+Enter is a different command and Shift+arrow is a
    // selection gesture we do not own.
    const plain = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
    const nextStatus = singleKeys ? statusForKey(e, byId.get(row.id)?.status ?? 'todo') : null
    if (nextStatus) {
      e.preventDefault()
      setStatus(row.id, nextStatus)
    } else if (e.key === 'Enter' && e.altKey) {
      e.preventDefault()
      addChild(row)
    } else if (e.key === 'Enter' && e.shiftKey) {
      // Plain Enter already opens the detail panel (the keyboard way in), so a sibling is Shift+Enter.
      e.preventDefault()
      startAdd(row.parentId, row.id)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      setOpenId(row.id)
    } else if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault()
      // Step over the previous sibling's whole visible block. Landing at index - 1 would put the
      // slot inside an expanded subtree above, and the lower depth clamp would drag the row
      // into it as that subtree's first child.
      let j = index - 1
      while (j > 0 && rows[j]!.depth > row.depth) j--
      run(row.id, j, row.depth)
    } else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault()
      // Mirror of Alt+Up and of the pointer drag: land after the next row's whole visible
      // block, not between it and its first child.
      const next = index + blockLength(index)
      if (next < rows.length) run(row.id, next + blockLength(next), row.depth)
    } else if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      // Indent / outdent. Alt+arrows rather than Tab: Tab must keep leaving the tree, or the
      // tree is a keyboard trap (WCAG 2.1.2).
      e.preventDefault()
      run(row.id, index, row.depth + (e.key === 'ArrowRight' ? 1 : -1))
    } else if (plain && (e.key === 'ArrowDown' || (singleKeys && e.key === 'j'))) {
      // Clamped at the ends rather than wrapping: a list that jumps from bottom to top loses the
      // person's place silently.
      e.preventDefault()
      focusRow(index + 1)
    } else if (plain && (e.key === 'ArrowUp' || (singleKeys && e.key === 'k'))) {
      e.preventDefault()
      focusRow(index - 1)
    } else if (plain && e.key === 'Home') {
      e.preventDefault()
      focusRow(0)
    } else if (plain && e.key === 'End') {
      e.preventDefault()
      focusRow(rows.length - 1)
    } else if (plain && e.key === 'ArrowRight') {
      e.preventDefault()
      if (row.hasChildren && row.collapsed) toggle(row.id)
      else if (row.hasChildren) focusRow(index + 1)
    } else if (plain && e.key === 'ArrowLeft') {
      e.preventDefault()
      if (row.hasChildren && !row.collapsed) toggle(row.id)
      else if (row.parentId) {
        const parent = rows.findIndex((r) => r.id === row.parentId)
        if (parent >= 0) focusRow(parent)
      }
    }
  }

  // The input renders after the last visible row of the parent's subtree (or of the whole list
  // for the root level): the end of the sibling group, which is where the server will put it.
  let inputSlot = -1
  let inputDepth = 1
  if (adding) {
    const at = adding.parentId === null ? -1 : rows.findIndex((r) => r.id === adding.parentId)
    inputSlot = at < 0 ? rows.length : at + blockLength(at)
    inputDepth = at < 0 ? 1 : rows[at]!.depth + 1
  }
  const input = adding && (
    <NewTaskInput
      depth={inputDepth}
      onCommit={commitAdd}
      onCancel={cancelAdd}
      error={createError}
    />
  )

  const onDragEnd = ({ active, over, delta }: DragEndEvent) => {
    const from = rows.findIndex((r) => r.id === active.id)
    const overIndex = over ? rows.findIndex((r) => r.id === over.id) : -1
    if (from < 0 || overIndex < 0) return
    // Dropping below the target lands after its whole visible block, not inside it.
    const slot = overIndex > from ? overIndex + blockLength(overIndex) : overIndex
    run(rows[from]!.id, slot, rows[from]!.depth + Math.round(delta.x / INDENT_PX))
  }

  // Focus goes back to the handle that opened the panel (a moved-away task has no handle left).
  const closeDetail = () => {
    const id = openId
    setOpenId(null)
    if (id) document.querySelector<HTMLElement>(`[data-handle-id="${id}"]`)?.focus()
  }

  // A save can also take the task out of this list (moved to another project). The list the
  // save's callback sees is already updated but the screen is not, so the handle is still there
  // to take focus and is then removed under it. Remember the task, and once its row is really
  // gone put focus on the first remaining row instead of letting it fall to <body> (WCAG 2.4.3).
  const leaving = useRef<string | null>(null)
  /**
   * A save happened. It MARKS the row and nothing else: the pane stays open, in reading mode,
   * showing what was just written. Closing here would take the answer off screen at the moment
   * the person went to check it.
   */
  const savedClose = () => {
    if (!openTask) return
    setSavedId(openTask.id)
  }
  useEffect(() => {
    const id = leaving.current
    if (!id || document.querySelector(`[data-handle-id="${id}"]`)) return
    leaving.current = null
    document.querySelector<HTMLElement>('[data-handle-id]')?.focus()
  })

  // The panel also unmounts without onClose when its task leaves the list; focus would fall to
  // <body> (WCAG 2.4.3). Return it to the tree instead.
  useEffect(() => {
    if (openId && tasks.isSuccess && !openTask) {
      // Not a step anyone took: the task left this list (moved, deleted), so the address is put
      // right in place rather than leaving a Back that reopens nothing.
      setOpenId(null, { replace: true })
      queueMicrotask(() => document.querySelector<HTMLElement>('[data-handle-id]')?.focus())
    }
  }, [openId, openTask, tasks.isSuccess])

  const toggle = (id: string) => {
    const next = new Set(collapsed)
    if (!next.delete(id)) next.add(id)
    setCollapsed(next)
    saveCollapsed(projectId, next)
  }

  /**
   * Arriving from search: `?reveal=<id>` means "this task, visible". Routing to the project is
   * only half of it -- the task may sit several folds deep, and landing on a collapsed parent is
   * the single most likely way search lands wrong -- so every ancestor is unfolded first and the
   * row then takes focus, which also makes it the tree's tab stop.
   *
   * The parameter is dropped once consumed (`replace`, so Back still goes where it did): leaving
   * it in the URL would re-unfold the path every time this component re-rendered, fighting the
   * person who just folded it again.
   */
  const [params, setParams] = useSearchParams()
  const reveal = params.get('reveal')
  const forget = useForgetRecent()
  const pendingReveal = useRef<string | null>(null)
  useEffect(() => {
    if (!reveal || !tasks.data) return
    // Not in this project: leave the parameter alone rather than claiming a focus target that
    // does not exist. A wrong id is a dead link, not a hijacked focus.
    const target = tasks.data.tasks.find((t) => t.id === reveal)
    if (!target) {
      forget('task', reveal)
      return
    }
    // Unfolding is not enough when the row is FINISHED and finished rows are hidden:
    // search would route here and focus nothing. Arriving at a task is a request to see it.
    if (!showDone && (target.status === 'done' || target.status === 'cancelled')) {
      setShowDone(true)
      saveShowDone(projectId, true)
    }
    const chain = ancestorsOf(tasks.data.tasks, reveal)
    if (chain.some((id) => collapsed.has(id))) {
      const next = new Set(collapsed)
      for (const id of chain) next.delete(id)
      setCollapsed(next)
      saveCollapsed(projectId, next)
    }
    pendingReveal.current = reveal
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('reveal')
        return next
      },
      { replace: true },
    )
  }, [reveal, tasks.data, collapsed, showDone, projectId, setParams, forget])

  // The row only exists after the unfold has rendered, so the focus waits for that render rather
  // than running inside the effect above.
  useEffect(() => {
    const id = pendingReveal.current
    if (!id) return
    const el = document.querySelector<HTMLElement>(`[data-handle-id="${id}"]`)
    if (!el) return
    pendingReveal.current = null
    setActiveId(id)
    el.focus()
    el.scrollIntoView({ block: 'center' })
  })

  /**
   * THE TWO BULK ACTIONS, one request per task.
   *
   * Sequential rather than parallel, and deliberately: `move` takes a per-workspace advisory
   * lock on the tree's shape, so five concurrent moves would queue on it anyway while making the
   * failure of one impossible to attribute. Five requests is a handful; the lists refresh once,
   * at the end.
   */
  /**
   * Runs `act` over the selection, one request at a time, and keeps the SELECTION HONEST when
   * one of them fails.
   *
   * PARTIAL FAILURE IS THE CASE THAT MATTERS. Five requests go out; if the third is refused, two
   * are already applied and three are not. Clearing the whole selection would hide which, and
   * leaving it whole would mean pressing again re-does the two that worked. So each id leaves
   * the selection as it succeeds, and what is left afterwards is exactly what still needs doing
   * -- pressing the same button again retries precisely that.
   *
   * Sequential rather than parallel, deliberately: `move` takes a per-workspace advisory lock on
   * the tree's shape, so concurrent moves queue on it anyway while making a failure impossible
   * to attribute to one row.
   */
  const runOverSelection = async (
    act: (id: string) => Promise<unknown>,
    /** Given the ids that really succeeded, and run whether or not one of them failed. */
    settle?: (done: ReadonlySet<string>) => void | Promise<void>,
  ) => {
    setBulkBusy(true)
    const done = new Set<string>()
    try {
      for (const id of selected) {
        await act(id)
        done.add(id)
      }
    } catch (e) {
      const left = selected.size - done.size
      setError(`${e instanceof Error ? e.message : "That didn't work"} (${left} left undone)`)
    } finally {
      setSelected((prev) => new Set([...prev].filter((id) => !done.has(id))))
      setBulkBusy(false)
      await settle?.(done)
      await refreshTasks(qc, projectId)
    }
  }

  const bulkFinish = () =>
    runOverSelection(
      (id) => patchTask(id, { status: 'done' }),
      // The rows that really finished stay on screen, the same way a single one does --
      // `done`, not the whole selection, or a half-failed run would pin rows that never moved.
      (done) => setKeptFinished((prev) => new Set([...prev, ...done])),
    )

  const bulkMove = (toProjectId: string) =>
    runOverSelection(
      // `parentId: null` -- a task moved to another project lands at that project's root.
      // Keeping its parent would mean moving the parent too, which is a different request than
      // the one the person made.
      (id) => moveTask(id, { projectId: toProjectId, parentId: null }),
      // Unconditionally: if three of five landed, the destination holds three and its cache has
      // to say so.
      () => refreshTasks(qc, toProjectId),
    )

  const toggleDone = () => {
    const next = !showDone
    setShowDone(next)
    saveShowDone(projectId, next)
  }

  return (
    <>
      {/* THE ONE CONTROL THE HIDING ADDS, and it is absent until there is something to say: a project
          with nothing finished shows no chrome for it. `aria-pressed` rather than a checkbox --
          it is a view toggle, not a field, and the count IS the label. */}
      {(hiddenDone > 0 || showDone) && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={toggleDone}
            aria-pressed={showDone}
            data-show-done={showDone ? 'on' : 'off'}
            className="min-h-8 rounded-md px-2 text-sm text-ink-muted hover:bg-hover hover:text-ink"
          >
            {showDone ? 'Hide done' : `${hiddenDone} done`}
          </button>
        </div>
      )}
      <SelectionBar
        count={selected.size}
        projects={allProjects.data ?? []}
        currentProjectId={projectId}
        onFinish={() => void bulkFinish()}
        onMove={(to) => void bulkMove(to)}
        onClear={() => setSelected(new Set())}
        busy={bulkBusy}
      />
      {tasks.isError && (
        <p role="alert" className="mt-4 text-sm text-danger">
          Couldn't load tasks
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
      {tasks.isSuccess && rows.length === 0 && !adding && (
        // TWO DIFFERENT EMPTIES. A project with nothing in it and a project whose every
        // task is finished are opposite situations, and telling someone who just cleared their
        // list that they "have no tasks yet" reads as having lost the work.
        <EmptyState
          title={hiddenDone > 0 ? 'This project is clear' : 'No tasks in this project yet'}
          action={
            <button
              type="button"
              className={EMPTY_ACTION}
              // The one action that fills this page is the input already on it; this puts the
              // cursor in it rather than adding a second way to create a task.
              onClick={() =>
                document.querySelector<HTMLElement>('input[aria-label="New task"]')?.focus()
              }
            >
              {hiddenDone > 0 ? 'Add another' : 'Add the first task'}
            </button>
          }
        />
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          {/* No top margin: the tree is the first thing in its panel, under the one input that
              adds a root task. */}
          {/* One measure for every task list (rowLead): the title no longer competes with
              anything to its right, so there is nothing left for the measure to be derived from. */}
          <ul data-task-tree className={`${ROW_LIST} ${LIST_MEASURE}`}>
            {/* One flat list, the input keyed beside the rows rather than inside the one it
                follows: when a created row lands, the input moves after it instead of being
                rebuilt -- a rebuilt box is empty and focused while its create is still out, and
                the Enter typed into it is dropped. */}
            {rows.flatMap((row, i) => [
              <TaskRow
                key={row.id}
                row={row}
                projectId={projectId}
                title={byId.get(row.id)?.title ?? ''}
                status={byId.get(row.id)?.status ?? 'todo'}
                dueAt={byId.get(row.id)?.dueAt ?? null}
                scheduledOn={byId.get(row.id)?.scheduledOn ?? null}
                hasNotes={(byId.get(row.id)?.notes ?? '') !== ''}
                capturedAt={inInbox ? (byId.get(row.id)?.createdAt ?? null) : null}
                rollup={row.hasChildren ? rollupPhrase(tasks.data?.rollups[row.id]) : null}
                blockedBy={tasks.data?.blockers[row.id]}
                saved={savedId === row.id}
                tabStop={row.id === tabId}
                onFocus={() => setActiveId(row.id)}
                onSetStatus={(status) => setStatus(row.id, status)}
                onToggle={() => toggle(row.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
                onOpen={() => setOpenId(row.id)}
                selected={selected.has(row.id)}
                onToggleSelected={() =>
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (!next.delete(row.id)) next.add(row.id)
                    return next
                  })
                }
                onAddChild={() => addChild(row)}
              />,
              ...(inputSlot === i + 1 ? [<Fragment key="new-task">{input}</Fragment>] : []),
            ])}
          </ul>
        </SortableContext>
      </DndContext>
      {openTask && (
        <TaskDetail
          key={openTask.id}
          task={openTask}
          projectId={projectId}
          onClose={closeDetail}
          onSaved={savedClose}
        />
      )}
    </>
  )
}

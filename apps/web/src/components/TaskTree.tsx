import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { MoveTaskBody, TaskResponse } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createTask, listProjectTasks, moveTask } from '../api/tasks'
import { refreshTasks, tasksKey } from '../api/taskCache'
import { ancestorsOf } from '../tree/ancestors'
import { flatten } from '../tree/flatten'
import { loadCollapsed, saveCollapsed } from '../tree/collapse'
import { MAX_DEPTH, planDrop, type DropPlan } from '../tree/drop'
import { useTaskActions } from '../api/taskActions'
import { useShortcutsEnabled } from '../shortcuts/enabled'
import { TaskDetail } from './TaskDetail'
import { statusForKey } from './StatusControls'
import { NewTaskInput } from './NewTaskInput'
import { INDENT_PX } from './RowParts'
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
  const key = tasksKey(projectId)
  const [collapsed, setCollapsed] = useState(() => loadCollapsed(projectId))
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  // Where an inline create input is showing: the parent whose children it appends to (null is
  // the root level) and the row whose handle gets focus back when it is cancelled. The server
  // appends a new task to the END of its parent's children, so that is where the input sits.
  const [adding, setAdding] = useState<{ parentId: string | null; from: string } | null>(null)
  const inFlight = useRef(false)
  // Which row holds the tree's single tab stop. It follows focus, so Tab re-enters the tree at
  // the row the person last used instead of jumping back to the top (the roving tabindex, D51).
  const [activeId, setActiveId] = useState<string | null>(null)
  const singleKeys = useShortcutsEnabled()

  // The cache holds exactly what listProjectTasks returns; the rows are derived, never cached.
  const tasks = useQuery({ queryKey: key, queryFn: () => listProjectTasks(projectId) })
  const rows = useMemo(() => flatten(tasks.data ?? [], collapsed), [tasks.data, collapsed])
  // Looked up by id each render, so a task that has left this project (moved away) closes itself.
  const openTask = tasks.data?.find((t) => t.id === openId)
  const byId = useMemo(() => new Map((tasks.data ?? []).map((t) => [t.id, t])), [tasks.data])
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
    mutationFn: ({ id, body }: { id: string; body: MoveTaskBody }) => moveTask(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<TaskResponse[]>(key)
      qc.setQueryData<TaskResponse[]>(key, (old) => applyMove(old ?? [], id, body))
      return { previous }
    },
    onError: (error, _vars, context) => {
      // Without this the UI keeps a state the database does not contain, and the user believes
      // the move succeeded until the next reload. See Review Focus 5.
      if (context?.previous) qc.setQueryData(key, context.previous)
      setError(error instanceof Error ? error.message : '移动失败')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const run = (draggedId: string, slot: number, wantedDepth: number) => {
    if (slot < 0 || slot > rows.length) return
    const plan: DropPlan = planDrop({ rows, draggedId, slot, wantedDepth })
    // A refused plan means do nothing: never send a move the plan refused.
    if (!plan.ok) {
      if (plan.reason === 'own-subtree') setError('不能把任务移到它自己的子任务里')
      else if (plan.reason === 'too-deep') setError('层级太深，无法移到那里')
      return
    }
    setError(null)
    // The gesture is legal and the intent clear, so show the result: a row moved under a folded
    // parent would otherwise vanish from the screen while sitting in the database.
    if (plan.parentId && collapsed.has(plan.parentId)) {
      const next = new Set(collapsed)
      next.delete(plan.parentId)
      setCollapsed(next)
      saveCollapsed(projectId, next)
    }
    const body: MoveTaskBody = { projectId, parentId: plan.parentId }
    if (plan.beforeId) body.beforeId = plan.beforeId
    if (plan.afterId) body.afterId = plan.afterId
    move.mutate({ id: draggedId, body })
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
    setAdding({ parentId, from })
  }

  const addChild = (row: (typeof rows)[number]) => {
    if (row.depth >= MAX_DEPTH) setError('层级太深，无法在这里添加子任务')
    else startAdd(row.id, row.id)
  }

  const commitAdd = async (title: string) => {
    if (!adding || inFlight.current) return false
    inFlight.current = true
    try {
      await createTask({ projectId, title, parentId: adding.parentId })
      await refreshTasks(qc, projectId)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
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
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const row = rows[index]!
    // Bare, with no Shift either: Shift+Enter is a different command and Shift+arrow is a
    // selection gesture we do not own.
    const plain = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
    const nextStatus = singleKeys ? statusForKey(e, byId.get(row.id)?.status ?? 'todo') : null
    if (nextStatus) {
      e.preventDefault()
      setError(null)
      actions.setStatus(row.id, nextStatus)
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
    <NewTaskInput depth={inputDepth} onCommit={commitAdd} onCancel={cancelAdd} />
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
  const savedClose = () => {
    if (!openTask) return
    setSavedId(openTask.id)
    leaving.current = openTask.id
    setTimeout(() => (leaving.current = null), 1000)
    closeDetail()
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
      setOpenId(null)
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
  const pendingReveal = useRef<string | null>(null)
  useEffect(() => {
    if (!reveal || !tasks.data) return
    // Not in this project: leave the parameter alone rather than claiming a focus target that
    // does not exist. A wrong id is a dead link, not a hijacked focus.
    if (!tasks.data.some((t) => t.id === reveal)) return
    const chain = ancestorsOf(tasks.data, reveal)
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
  }, [reveal, tasks.data, collapsed, projectId, setParams])

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

  return (
    <>
      {tasks.isError && (
        <p role="alert" className="mt-4 text-sm text-danger">
          任务加载失败
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <ul data-task-tree className="mt-4 flex flex-col">
            {rows.map((row, i) => (
              <Fragment key={row.id}>
                <TaskRow
                  row={row}
                  projectId={projectId}
                  title={byId.get(row.id)?.title ?? ''}
                  status={byId.get(row.id)?.status ?? 'todo'}
                  dueAt={byId.get(row.id)?.dueAt ?? null}
                  scheduledOn={byId.get(row.id)?.scheduledOn ?? null}
                  saved={savedId === row.id}
                  tabStop={row.id === tabId}
                  onFocus={() => setActiveId(row.id)}
                  onSetStatus={(status) => {
                    setError(null)
                    actions.setStatus(row.id, status)
                  }}
                  onToggle={() => toggle(row.id)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  onOpen={() => setOpenId(row.id)}
                  onAddChild={() => addChild(row)}
                />
                {inputSlot === i + 1 && input}
              </Fragment>
            ))}
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

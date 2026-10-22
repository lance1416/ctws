import { type TaskId, type TaskResponse, type TaskStatus } from '@ctws/contracts'
import { addDays } from '@ctws/core/day'
import { nextMonday, ymd } from '../../../../platform/time/dates'
import { ancestorsOf } from '../tree/ancestors'
import { flatten } from '../tree/flatten'

/** A leaf on the board, and the steps between its group's head and it ("Batch 3"). */
export type BoardCard = { task: TaskResponse; path: string | null }
/** The leaves under one top-level parent, in one column. */
type BoardGroup = { root: TaskResponse; cards: BoardCard[] }
export type BoardColumn = {
  status: TaskStatus
  /** Leaves straight under the project: first, under no head. */
  loose: BoardCard[]
  groups: BoardGroup[]
  count: number
}

/** The board's statuses left to right; the first and the last fold to strips at the sides. */
export const BOARD_ORDER = [
  'backlog',
  'todo',
  'in_progress',
  'done',
  'cancelled',
] as const satisfies readonly TaskStatus[]
/** The strips at the board's sides, folded until opened. */
export const SIDE_STATUSES: readonly TaskStatus[] = ['backlog', 'cancelled']

/** Cards a group shows before the rest go under "N more". */
export const GROUP_LIMIT = 5
/** About two groups' worth: a column opens its groups in order until the next would pass this. */
const OPEN_UNTIL = 10

/** The Monday a week counts from, among the account's days. */
export const weekStartOf = (today: string): string => addDays(nextMonday(today), -7)

/**
 * THE BOARD BY STATUS (FR-057): each status's leaves, those straight under the project first,
 * then the rest grouped under their top-level parent, in the tree's own order. A parent is never
 * a card: its status is its children's. Done holds only this week's unless asked for all.
 */
export function boardColumns(
  tasks: readonly TaskResponse[],
  { today, timeZone, allDone }: { today: string; timeZone: string; allDone: boolean },
): Map<TaskStatus, BoardColumn> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const parents = new Set(tasks.flatMap((t) => (t.parentId === null ? [] : [t.parentId])))
  // The tree's order, every row shown: a card sits where its row would.
  const order = new Map(flatten(tasks, new Set()).map((row, i) => [row.id, i]))
  const at = (id: TaskId) => order.get(id) ?? Number.MAX_SAFE_INTEGER
  const since = weekStartOf(today)

  const columns = new Map<TaskStatus, BoardColumn>(
    BOARD_ORDER.map((status) => [status, { status, loose: [], groups: [], count: 0 }]),
  )
  const leaves = tasks.filter((t) => !parents.has(t.id)).sort((a, b) => at(a.id) - at(b.id))
  for (const leaf of leaves) {
    // Done without a day yet is done just now: the server stamps it when the change lands.
    const before =
      leaf.status === 'done' &&
      leaf.completedAt !== null &&
      ymd(new Date(leaf.completedAt), timeZone) < since
    if (before && !allDone) continue
    const column = columns.get(leaf.status)!
    column.count++
    // Nearest first: the last is the top-level parent, the head of its group.
    const above = ancestorsOf(tasks, leaf.id)
    const root = above.length > 0 ? byId.get(above.at(-1)!) : undefined
    if (!root) {
      column.loose.push({ task: leaf, path: null })
      continue
    }
    const between = above
      .slice(0, -1)
      .reverse()
      .map((id) => byId.get(id)?.title)
      .filter((title): title is string => title !== undefined)
    const card = { task: leaf, path: between.length > 0 ? between.join(' / ') : null }
    const group = column.groups.find((g) => g.root.id === root.id)
    if (group) group.cards.push(card)
    else column.groups.push({ root, cards: [card] })
  }
  for (const column of columns.values()) column.groups.sort((a, b) => at(a.root.id) - at(b.root.id))
  return columns
}

/**
 * The groups a column opens before anyone folds or opens one: in order, while what it shows stays
 * about two groups long; the rest wait folded. Finished work starts folded, as in the tree.
 */
export function openGroups(column: BoardColumn): Set<TaskId> {
  const open = new Set<TaskId>()
  if (column.status === 'done' || column.status === 'cancelled') return open
  let shown = Math.min(column.loose.length, GROUP_LIMIT)
  for (const group of column.groups) {
    shown += Math.min(group.cards.length, GROUP_LIMIT)
    if (shown > OPEN_UNTIL) break
    open.add(group.root.id)
  }
  return open
}

/** One run of cards a column draws: the project's own (no head) or one top-level parent's. */
export type ShownGroup = {
  root: TaskResponse | null
  open: boolean
  /** All its cards in this column, shown or not. */
  count: number
  cards: BoardCard[]
  /** Behind "N more". */
  more: number
}

/**
 * What a column draws: each run of cards, folded or open, five at most until "N more" is asked
 * for. A card being dragged here (`landing`) always shows, as the place it will land.
 */
export function shownColumn(
  column: BoardColumn,
  {
    isOpen,
    isAll,
    landing,
  }: {
    isOpen: (root: TaskId) => boolean
    isAll: (root: TaskId | null) => boolean
    landing: TaskId | null
  },
): ShownGroup[] {
  const runs = [{ root: null, cards: column.loose }, ...column.groups].filter(
    (run) => run.cards.length > 0,
  )
  return runs.map(({ root, cards }) => {
    const lands = cards.find((c) => c.task.id === landing)
    const open = root === null || isOpen(root.id) || lands !== undefined
    const shown = open ? cards.slice(0, isAll(root?.id ?? null) ? cards.length : GROUP_LIMIT) : []
    if (lands && !shown.includes(lands)) shown.push(lands)
    return {
      root,
      open,
      count: cards.length,
      cards: shown,
      more: open ? cards.length - shown.length : 0,
    }
  })
}

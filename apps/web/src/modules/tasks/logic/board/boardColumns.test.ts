import { idFrom, projectId, taskId, type TaskResponse, type TaskStatus } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { boardColumns, openGroups, shownColumn, weekStartOf } from './boardColumns'

/** Thursday, October 22, in London: given, never read off the clock. */
const TODAY = '2026-10-22'
const TZ = 'Europe/London'
const PROJECT = idFrom(projectId, '00000000-0000-0000-0000-00000000000a')
const id = (n: string) => idFrom(taskId, `00000000-0000-0000-0000-${n.padStart(12, '0')}`)

const task = (
  n: string,
  parent: string | null,
  rank: string,
  over: Partial<TaskResponse> = {},
): TaskResponse => ({
  id: id(n),
  projectId: PROJECT,
  parentId: parent === null ? null : id(parent),
  title: `T${n}`,
  notes: null,
  status: 'todo',
  scheduledOn: null,
  dueAt: null,
  rank,
  stageId: null,
  stageSince: null,
  completedAt: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
  ...over,
})

const titles = (cards: { task: TaskResponse }[]) => cards.map((c) => c.task.title)
const board = (tasks: TaskResponse[], allDone = false) =>
  boardColumns(tasks, { today: TODAY, timeZone: TZ, allDone })
const column = (tasks: TaskResponse[], status: TaskStatus, allDone = false) =>
  board(tasks, allDone).get(status)!

describe('boardColumns', () => {
  // Redesign > Batch 3 > two leaves; Redesign > one leaf; a leaf straight under the project.
  const tree = [
    task('1', null, 'b'),
    task('2', '1', 'a'),
    task('3', '2', 'a'),
    task('4', '2', 'b', { status: 'in_progress' }),
    task('5', '1', 'b'),
    task('6', null, 'a'),
  ]

  it('puts leaves only, the project’s own first, the rest under their top-level parent', () => {
    const todo = column(tree, 'todo')
    expect(titles(todo.loose)).toEqual(['T6'])
    expect(todo.groups.map((g) => g.root.title)).toEqual(['T1'])
    expect(titles(todo.groups[0]!.cards)).toEqual(['T3', 'T5'])
    expect(todo.count).toBe(3)
    // A parent is never a card.
    expect(titles(todo.groups.flatMap((g) => g.cards))).not.toContain('T2')
  })

  it('says the steps between a group’s head and its card', () => {
    const cards = column(tree, 'todo').groups[0]!.cards
    expect(cards.map((c) => c.path)).toEqual(['T2', null])
  })

  it('keeps each status to its own column', () => {
    expect(titles(column(tree, 'in_progress').groups[0]!.cards)).toEqual(['T4'])
    expect(column(tree, 'backlog').count).toBe(0)
  })

  it('shows this week’s done unless all is asked for', () => {
    const done = [
      task('7', null, 'a', { status: 'done', completedAt: '2026-10-19T09:00:00.000Z' }),
      task('8', null, 'b', { status: 'done', completedAt: '2026-10-18T09:00:00.000Z' }),
    ]
    // Monday the 19th is this week's first day; Sunday the 18th is last week's.
    expect(weekStartOf(TODAY)).toBe('2026-10-19')
    expect(titles(column(done, 'done').loose)).toEqual(['T7'])
    expect(titles(column(done, 'done', true).loose)).toEqual(['T7', 'T8'])
    // Just finished, before the server has stamped the day: this week's.
    const now = task('9', null, 'c', { status: 'done' })
    expect(titles(column([...done, now], 'done').loose)).toEqual(['T7', 'T9'])
  })
})

describe('openGroups', () => {
  // Two leaves of its own, then groups of 14, 8 and 7 leaves in To do (artboard 21).
  const groups = (status: TaskStatus, sizes: number[]) => {
    const tasks = [task('1', null, 'a', { status }), task('2', null, 'b', { status })]
    sizes.forEach((size, g) => {
      const root = `${g + 1}00`
      tasks.push(task(root, null, `c${g}`))
      for (let i = 0; i < size; i++)
        tasks.push(task(`${root}${i + 10}`, root, `${i + 10}`, { status }))
    })
    return column(tasks, status)
  }

  it('opens groups in order while the column stays about two groups long', () => {
    const todo = groups('todo', [14, 8, 7])
    expect([...openGroups(todo)]).toEqual([todo.groups[0]!.root.id])
    const short = groups('in_progress', [2, 1, 1])
    expect(openGroups(short).size).toBe(3)
  })

  it('starts finished work folded', () => {
    expect(openGroups(groups('done', [1])).size).toBe(0)
  })
})

describe('shownColumn', () => {
  // Seven of the project's own, then a group of three.
  const tasks = [
    ...Array.from({ length: 7 }, (_, i) => task(`${i + 1}`, null, `a${i}`)),
    task('20', null, 'b'),
    ...Array.from({ length: 3 }, (_, i) => task(`${i + 21}`, '20', `${i}`)),
  ]
  const todo = column(tasks, 'todo')
  const none = { isOpen: () => false, isAll: () => false, landing: null }

  it('shows five of a run and counts the rest, and nothing of a folded group but its head', () => {
    const [own, group] = shownColumn(todo, none)
    expect(own!.root).toBeNull()
    expect([own!.cards.length, own!.more]).toEqual([5, 2])
    expect([group!.open, group!.count, group!.cards.length, group!.more]).toEqual([false, 3, 0, 0])
  })

  it('shows every card once asked, and opens a group when asked', () => {
    const [own, group] = shownColumn(todo, { ...none, isOpen: () => true, isAll: () => true })
    expect([own!.cards.length, own!.more]).toEqual([7, 0])
    expect(titles(group!.cards)).toEqual(['T21', 'T22', 'T23'])
  })

  it('always shows the card being dragged in, where it will land', () => {
    const [own, group] = shownColumn(todo, { ...none, landing: id('23') })
    // Its folded group opens, so the place shows among its neighbours.
    expect(group!.open).toBe(true)
    expect(titles(group!.cards)).toEqual(['T21', 'T22', 'T23'])
    const seventh = shownColumn(todo, { ...none, landing: id('7') })[0]!
    expect(seventh.cards.at(-1)!.task.title).toBe('T7')
    expect(seventh.more).toBe(1)
    expect(own!.cards).toHaveLength(5)
  })
})

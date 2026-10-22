import {
  idFrom,
  projectId,
  stageId,
  taskId,
  type StageResponse,
  type TaskResponse,
} from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { stageColumns } from './stageColumns'

/** Thursday, October 22, in London: given, never read off the clock. */
const TODAY = '2026-10-22'
const TZ = 'Europe/London'
const PROJECT = idFrom(projectId, '00000000-0000-0000-0000-00000000000a')
const id = (n: string) => idFrom(taskId, `00000000-0000-0000-0000-${n.padStart(12, '0')}`)
const stage = (n: string, name: string): StageResponse => ({
  id: idFrom(stageId, `00000000-0000-0000-0000-${n.padStart(12, '0')}`),
  name,
  collapsed: false,
  count: 0,
})
const APPLIED = stage('51', 'Applied')
const ONSITE = stage('52', 'Onsite')

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
const board = (tasks: TaskResponse[]) =>
  stageColumns(tasks, [APPLIED, ONSITE], { today: TODAY, timeZone: TZ })

describe('stageColumns', () => {
  it('puts each node at its stage, at any depth, with the path above it', () => {
    const tasks = [
      task('1', null, 'a'),
      task('2', '1', 'a', { stageId: ONSITE.id }),
      task('3', '2', 'a'),
      task('4', null, 'b', { stageId: APPLIED.id }),
      task('5', null, 'c'),
    ]
    const [applied, onsite] = board(tasks)
    expect(titles(applied!.cards)).toEqual(['T4'])
    expect(titles(onsite!.cards)).toEqual(['T2'])
    expect(onsite!.cards[0]!.path.map((t) => t.title)).toEqual(['T1'])
    expect(applied!.cards[0]!.path).toEqual([])
  })

  it('says the next leaf still to do: the one under way, else the first waiting', () => {
    const tasks = [
      task('1', null, 'a', { stageId: APPLIED.id }),
      task('2', '1', 'a', { status: 'done' }),
      task('3', '1', 'b'),
      task('4', '1', 'c', { status: 'in_progress' }),
      task('9', null, 'b', { stageId: APPLIED.id }),
      task('10', '9', 'a'),
      task('11', '9', 'b'),
    ]
    const cards = board(tasks)[0]!.cards
    expect(cards.find((c) => c.task.title === 'T1')!.next?.title).toBe('T4')
    expect(cards.find((c) => c.task.title === 'T9')!.next?.title).toBe('T10')
  })

  it('counts whole days at the stage on the account’s calendar', () => {
    // 23:30 UTC on the 1st is already the 2nd in London: 20 days, not 21.
    const tasks = [
      task('1', null, 'a', { stageId: APPLIED.id, stageSince: '2026-10-01T23:30:00Z' }),
    ]
    expect(board(tasks)[0]!.cards[0]!.days).toBe(20)
  })

  it('puts dated ones first, nearest first, then the longest waiting', () => {
    const tasks = [
      task('1', null, 'a', { stageId: APPLIED.id, stageSince: '2026-10-20T09:00:00Z' }),
      task('2', null, 'b', { stageId: APPLIED.id, stageSince: '2026-10-01T09:00:00Z' }),
      task('3', null, 'c', {
        stageId: APPLIED.id,
        stageSince: '2026-10-21T09:00:00Z',
        dueAt: '2026-10-31T17:00:00Z',
      }),
      task('4', null, 'd', {
        stageId: APPLIED.id,
        stageSince: '2026-10-21T09:00:00Z',
        dueAt: '2026-10-23T17:00:00Z',
      }),
      // Finished, its deadline no longer counts.
      task('5', null, 'e', {
        stageId: APPLIED.id,
        status: 'done',
        stageSince: '2026-10-10T09:00:00Z',
        dueAt: '2026-10-20T17:00:00Z',
      }),
    ]
    expect(titles(board(tasks)[0]!.cards)).toEqual(['T4', 'T3', 'T2', 'T5', 'T1'])
  })
})

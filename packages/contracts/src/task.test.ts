import { describe, expect, it } from 'vitest'
import {
  createTaskBody,
  moveTaskBody,
  taskStatus,
  TASK_EVENT_TYPES,
  TASK_STATUSES,
  updateTaskBody,
} from './task'

describe('taskStatus', () => {
  it('accepts exactly the five spec statuses', () => {
    expect([...TASK_STATUSES]).toEqual(['backlog', 'todo', 'in_progress', 'done', 'cancelled'])
    for (const s of TASK_STATUSES) expect(taskStatus.safeParse(s).success).toBe(true)
  })

  it.each(['waiting', 'open', 'closed', 'DONE', ''])('rejects %j', (s) => {
    expect(taskStatus.safeParse(s).success).toBe(false)
  })
})

describe('createTaskBody', () => {
  const valid = { projectId: '01931b9c-5d7e-7c3a-8f2e-1a2b3c4d5e6f', title: 'write the thing' }

  it('needs only a project and a title', () => {
    expect(createTaskBody.safeParse(valid).success).toBe(true)
  })

  it('defaults the status to backlog, so capturing an idea costs nothing', () => {
    expect(createTaskBody.parse(valid).status).toBe('backlog')
  })

  it('rejects an empty or whitespace-only title', () => {
    expect(createTaskBody.safeParse({ ...valid, title: '   ' }).success).toBe(false)
  })

  it('accepts a parent for a nested task', () => {
    const parsed = createTaskBody.safeParse({
      ...valid,
      parentId: '01931b9c-5d7e-7c3a-8f2e-1a2b3c4d5e70',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects unknown keys', () => {
    expect(createTaskBody.safeParse({ ...valid, rank: 'a0' }).success).toBe(false)
  })

  // rank is server-computed (spec section 8.3): the client never supplies or guesses one.
  it('has no rank field at all', () => {
    expect(Object.keys(createTaskBody.shape)).not.toContain('rank')
  })
})

describe('updateTaskBody', () => {
  it('accepts a scheduled date without a time', () => {
    expect(updateTaskBody.safeParse({ scheduledOn: '2026-10-15' }).success).toBe(true)
  })

  it('rejects a timestamp where a date is expected', () => {
    expect(updateTaskBody.safeParse({ scheduledOn: '2026-10-15T10:00:00Z' }).success).toBe(false)
  })

  it('accepts an instant for the hard deadline', () => {
    expect(updateTaskBody.safeParse({ dueAt: '2026-10-15T23:59:00Z' }).success).toBe(true)
  })

  it('accepts manual progress within 0..1 and rejects outside it', () => {
    expect(updateTaskBody.safeParse({ manualProgress: 0.5 }).success).toBe(true)
    expect(updateTaskBody.safeParse({ manualProgress: 1 }).success).toBe(true)
    expect(updateTaskBody.safeParse({ manualProgress: 1.5 }).success).toBe(false)
    expect(updateTaskBody.safeParse({ manualProgress: -0.1 }).success).toBe(false)
  })

  // Reparenting and reordering go through POST /tasks/:id/move, never a generic PATCH,
  // because they carry invariants a PATCH must not silently take on (spec section 8.3).
  it('cannot change parentId, projectId or rank', () => {
    for (const key of ['parentId', 'projectId', 'rank']) {
      expect(
        updateTaskBody.safeParse({ [key]: '01931b9c-5d7e-7c3a-8f2e-1a2b3c4d5e6f' }).success,
      ).toBe(false)
    }
  })
})

describe('moveTaskBody', () => {
  const pid = '01931b9c-5d7e-7c3a-8f2e-1a2b3c4d5e6f'

  it('takes a target project and an optional parent', () => {
    expect(moveTaskBody.safeParse({ projectId: pid, parentId: null }).success).toBe(true)
  })

  // The client reports which neighbours the task lands between; the server computes the rank.
  it('takes neighbour ids rather than a rank', () => {
    expect(moveTaskBody.safeParse({ projectId: pid, parentId: null, afterId: pid }).success).toBe(
      true,
    )
    expect(moveTaskBody.safeParse({ projectId: pid, rank: 'a0' }).success).toBe(false)
  })
})

describe('TASK_EVENT_TYPES', () => {
  it('is exactly the ten types the spec lists', () => {
    expect([...TASK_EVENT_TYPES].sort()).toEqual(
      [
        'created',
        'deleted',
        'due_changed',
        'moved',
        'notes_changed',
        'progress_set',
        'restored',
        'scheduled_changed',
        'status_changed',
        'title_changed',
      ].sort(),
    )
  })

  // Spec section 9.1: a pure rank change must never produce an event, or dragging 20 items
  // during a tidy-up floods the log and poisons last_activity_at.
  it('has no event type for reordering', () => {
    expect([...TASK_EVENT_TYPES]).not.toContain('rank_changed')
    expect([...TASK_EVENT_TYPES]).not.toContain('reordered')
  })
})

describe('scheduledOn calendar validation', () => {
  it('rejects impossible days but accepts leap days', () => {
    expect(updateTaskBody.safeParse({ scheduledOn: '2026-02-30' }).success).toBe(false)
    expect(updateTaskBody.safeParse({ scheduledOn: '2026-13-01' }).success).toBe(false)
    expect(updateTaskBody.safeParse({ scheduledOn: '2028-02-29' }).success).toBe(true)
    expect(updateTaskBody.safeParse({ scheduledOn: '2026-02-29' }).success).toBe(false)
  })
})

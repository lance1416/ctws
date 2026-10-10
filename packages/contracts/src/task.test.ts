import { describe, expect, it } from 'vitest'
import { projectMovementResponse } from './task'
import {
  createTaskBody,
  moveTaskBody,
  searchTaskResponse,
  taskStatus,
  TASK_EVENT_TYPES,
  TASK_STATUSES,
  TODAY_SEGMENTS,
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

  it('defaults the status to todo, so the rollup can see the task at all', () => {
    // It was `backlog` until 2026-10-07. The rollup excludes a backlog node BEFORE looking at
    // its children (design spec §7.2), so with that default every parent reported no progress
    // however much was finished under it. `backlog` is now a bucket somebody puts work INTO.
    expect(createTaskBody.parse(valid).status).toBe('todo')
  })

  it('still accepts an explicit backlog, which is the only way in now', () => {
    expect(createTaskBody.parse({ ...valid, status: 'backlog' }).status).toBe('backlog')
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
        'dependency_added',
        'dependency_removed',
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

describe('TODAY_SEGMENTS', () => {
  // Pins the display order; the SQL CASE in listToday hard-codes the same precedence.
  it('is exactly the three segments in display order', () => {
    expect([...TODAY_SEGMENTS]).toEqual(['overdue', 'today', 'in_progress'])
  })
})

describe('searchTaskResponse', () => {
  const base = {
    id: '00000000-0000-7000-8000-000000000001',
    projectId: '00000000-0000-7000-8000-000000000002',
    parentId: null,
    title: 'a',
    notes: null,
    status: 'done',
    scheduledOn: null,
    dueAt: null,
    rank: 'm',
    manualProgress: null,
    completedAt: null,
    createdAt: '2026-10-04T00:00:00Z',
    updatedAt: '2026-10-04T00:00:00Z',
  }

  it('carries the context a result needs to be actionable: project, parent, archived', () => {
    const parsed = searchTaskResponse.parse({
      ...base,
      projectName: 'Alpha',
      parentTitle: '父任务',
      projectArchived: true,
    })
    expect(parsed.projectName).toBe('Alpha')
    expect(parsed.parentTitle).toBe('父任务')
    expect(parsed.projectArchived).toBe(true)
  })

  it('requires the archived flag rather than defaulting it', () => {
    // A default of false would make every archived result claim to be live work, and nothing
    // would fail -- the client would simply stop saying a project is archived.
    const { success } = searchTaskResponse.safeParse({
      ...base,
      projectName: 'Alpha',
      parentTitle: null,
    })
    expect(success).toBe(false)
  })

  it('accepts a finished task: search is not filtered by status', () => {
    const parsed = searchTaskResponse.parse({
      ...base,
      status: 'cancelled',
      projectName: 'Alpha',
      parentTitle: null,
      projectArchived: false,
    })
    expect(parsed.status).toBe('cancelled')
  })
})

describe('projectMovementResponse', () => {
  const base = {
    projectId: '0199f0d6-0000-7000-8000-000000000001',
    projectName: '开源贡献',
    doneThisWeek: 2,
    remaining: 5,
    overdue: 1,
    lastActivityOn: '2026-09-28',
    quietDays: 7,
  }

  it('carries counts and movement', () => {
    expect(projectMovementResponse.parse(base)).toEqual(base)
  })

  it('allows a project nothing has ever happened in', () => {
    const parsed = projectMovementResponse.parse({
      ...base,
      lastActivityOn: null,
      quietDays: null,
    })
    expect(parsed.quietDays).toBeNull()
  })

  /**
   * The shape is `.strict()` on purpose and this is the assertion that keeps it honest: there is
   * no rollup (M3) and nothing writes `manual_progress`, so a ratio on this line would be a
   * number the backend cannot cash. Adding one has to be a deliberate change to the contract, not
   * something that slips in beside the counts.
   */
  it('refuses a percentage, however it is spelled', () => {
    for (const extra of [{ progress: 0.5 }, { percent: 50 }, { manualProgress: 0.5 }]) {
      expect(
        projectMovementResponse.safeParse({ ...base, ...extra }).success,
        JSON.stringify(extra),
      ).toBe(false)
    }
  })

  it('refuses a last-activity day that is an instant rather than a calendar day', () => {
    // The day is the USER'S calendar day, decided by the server. A timestamp here would mean the
    // client was being asked to work out which day that was, in which timezone.
    expect(
      projectMovementResponse.safeParse({ ...base, lastActivityOn: '2026-09-28T10:00:00Z' })
        .success,
    ).toBe(false)
  })

  it('refuses negative counts', () => {
    expect(projectMovementResponse.safeParse({ ...base, remaining: -1 }).success).toBe(false)
    expect(projectMovementResponse.safeParse({ ...base, quietDays: -1 }).success).toBe(false)
    expect(projectMovementResponse.safeParse({ ...base, overdue: -1 }).success).toBe(false)
  })

  /**
   * The project header banner shows four numbers and every one of them is the server's. A missing
   * field here would otherwise reach the banner as `undefined` and render as a blank where a
   * count should be -- which reads as "nothing is overdue".
   */
  it('requires the overdue count rather than letting the banner guess', () => {
    const { overdue: _overdue, ...withoutOverdue } = base
    expect(projectMovementResponse.safeParse(withoutOverdue).success).toBe(false)
  })
})

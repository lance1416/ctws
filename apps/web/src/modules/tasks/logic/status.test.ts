import { describe, expect, it } from 'vitest'
import { REOPEN, reopenedTo, toggleDoneTarget, toggleStartTarget } from './status'

describe('status targets', () => {
  it('finishing and restoring', () => {
    expect(toggleDoneTarget('todo')).toBe('done')
    expect(toggleDoneTarget('backlog')).toBe('done')
    expect(toggleDoneTarget('in_progress')).toBe('done')
    // A finished one comes back as it was, which only the change log may know.
    expect(toggleDoneTarget('done')).toBe(REOPEN)
    expect(toggleDoneTarget('cancelled')).toBe(REOPEN)
  })

  it('a finished task comes back to what it left the last time it was finished (BUG-095)', () => {
    const changed = (from: string, to: string) => ({
      type: 'status_changed',
      payload: { from, to },
    })
    // Newest first: started, finished; it comes back started.
    expect(reopenedTo([changed('in_progress', 'done'), changed('todo', 'in_progress')])).toBe(
      'in_progress',
    )
    expect(reopenedTo([{ type: 'renamed', payload: {} }, changed('todo', 'done')])).toBe('todo')
    // From the backlog, or with nothing on record: to do, never the backlog.
    expect(reopenedTo([changed('backlog', 'cancelled')])).toBe('todo')
    expect(reopenedTo([])).toBe('todo')
  })

  it('starting and stopping', () => {
    expect(toggleStartTarget('todo')).toBe('in_progress')
    expect(toggleStartTarget('done')).toBe('in_progress')
    expect(toggleStartTarget('in_progress')).toBe('todo')
  })
})

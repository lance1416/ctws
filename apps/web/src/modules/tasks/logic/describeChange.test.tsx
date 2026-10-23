import { describe, expect, it } from 'vitest'
import { describeTaskChange } from './describeChange'

const TZ = 'Europe/London'
const say = (type: string, payload: unknown) => describeTaskChange({ type, payload }, TZ)?.text

describe('describeTaskChange', () => {
  it('says what a status became, and nothing for a parent’s, which follows its children', () => {
    expect(say('status_changed', { from: 'todo', to: 'in_progress' })).toBe('Started')
    expect(say('status_changed', { from: 'in_progress', to: 'done' })).toBe('Done')
    expect(
      say('status_changed', { from: 'todo', to: 'in_progress', derived: true }),
    ).toBeUndefined()
  })

  it('says a deadline by its day on the account’s clock, and a plan by its day', () => {
    // 23:30 UTC on the 22nd is the 23rd in London.
    expect(say('due_changed', { from: null, to: '2026-10-22T23:30:00.000Z' })).toBe('Due Oct 23')
    expect(
      say('due_changed', { from: '2026-10-22T11:00:00.000Z', to: '2026-10-24T11:00:00.000Z' }),
    ).toBe('Due Oct 22 → Oct 24')
    expect(say('due_changed', { from: '2026-10-22T11:00:00.000Z', to: null })).toBe(
      'Deadline cleared',
    )
    expect(say('scheduled_changed', { from: null, to: '2026-10-22' })).toBe('Planned Oct 22')
    expect(say('scheduled_changed', { from: '2026-10-22', to: null })).toBe('Plan cleared')
  })

  it('says a rename by what it was, a stage by its name, and skips what it does not know', () => {
    expect(say('created', { from: null, to: { title: 'x' } })).toBe('Created')
    expect(say('title_changed', { from: 'Old', to: 'New' })).toBe('Renamed from “Old”')
    expect(say('stage_changed', { from: null, to: 'Onsite' })).toBe('Stage set to Onsite')
    // What it waits on, by the title kept with the change; an older change says less.
    expect(say('dependency_added', { blockerId: 'x', title: 'Update the CV' })).toBe(
      'Waiting on Update the CV',
    )
    expect(say('dependency_added', { blockerId: 'x' })).toBe('Waiting on another task')
    expect(say('dependency_removed', { blockerId: 'x', title: 'Update the CV' })).toBe(
      'No longer waiting on Update the CV',
    )
    expect(say('something_new', {})).toBeUndefined()
  })
})

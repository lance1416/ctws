import { describe, expect, it } from 'vitest'
import { describeReadingChange } from './describeChange'

const said = (type: string, payload: unknown) => describeReadingChange({ type, payload })?.text

describe('describeReadingChange', () => {
  it('says what happened to the item (FR-073)', () => {
    expect(said('created', { to: {} })).toBe('Added')
    expect(said('field_changed', { field: 'status', from: 'todo', to: 'reading' })).toBe(
      'Started reading',
    )
    expect(said('field_changed', { field: 'status', from: 'reading', to: 'done' })).toBe('Finished')
    expect(said('field_changed', { field: 'title', from: 'DDIA', to: 'Designing' })).toBe(
      'Renamed from “DDIA”',
    )
    expect(said('field_changed', { field: 'planOn', from: null, to: '2026-11-03' })).toBe(
      'Finish by Nov 3',
    )
  })

  it('says nothing of what is not news', () => {
    expect(said('field_changed', { field: 'projectId', from: null, to: 'x' })).toBeUndefined()
    expect(said('field_changed', { field: 'status', from: 'todo', to: 'weird' })).toBeUndefined()
  })
})

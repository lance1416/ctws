import { describe, expect, it } from 'vitest'
import { describePersonChange } from './describeChange'

const said = (type: string, payload: unknown) => describePersonChange({ type, payload })?.text

describe('describePersonChange', () => {
  it('says what happened to the person', () => {
    expect(said('created', { to: { name: 'Mira Chen' } })).toBe('Added')
    expect(said('field_changed', { field: 'name', from: 'Mira', to: 'Mira Chen' })).toBe(
      'Renamed from “Mira”',
    )
    expect(said('field_changed', { field: 'city', from: null, to: 'London' })).toBe(
      'Lives in London',
    )
    expect(said('field_changed', { field: 'hometown', from: 'Leeds', to: null })).toBe(
      'Hometown cleared',
    )
    expect(said('field_changed', { field: 'note', from: null, to: 'x' })).toBe('Notes changed')
    expect(said('role_added', { title: 'Staff engineer' })).toBe('Took a role: Staff engineer')
    expect(said('role_removed', { title: null })).toBe('A role removed')
  })

  it('says nothing of a change that is not news', () => {
    expect(said('field_changed', { field: 'gender', from: null, to: 'female' })).toBeUndefined()
    expect(said('something_new', {})).toBeUndefined()
  })
})

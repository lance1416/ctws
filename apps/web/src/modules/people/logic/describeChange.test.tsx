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

  it('says which role changed, from what to what (FR-044, BUG-083)', () => {
    const at = { organisationName: 'Stripe' }
    expect(said('role_added', { ...at, title: 'Engineer' })).toBe('Took a role: Engineer at Stripe')
    expect(
      said('role_changed', {
        ...at,
        from: { title: 'Engineer', from: '2021-03', to: null },
        to: { title: 'Staff engineer', from: '2021-03', to: null },
      }),
    ).toBe('Role changed: Engineer at Stripe → Staff engineer at Stripe')
    expect(
      said('role_changed', {
        ...at,
        from: { title: 'Staff engineer', from: '2021-03', to: null },
        to: { title: 'Staff engineer', from: '2021-03', to: '2026-10' },
      }),
    ).toBe('Staff engineer at Stripe: ended Oct 2026')
    expect(
      said('role_changed', {
        ...at,
        from: { title: 'Staff engineer', from: '2021-03', to: '2026-10' },
        to: { title: 'Staff engineer', from: '2020-09', to: null },
      }),
    ).toBe('Staff engineer at Stripe: Mar 2021 – Oct 2026 → Sep 2020 – now')
    expect(said('role_removed', { ...at, title: 'Staff engineer' })).toBe(
      'Role removed: Staff engineer at Stripe',
    )
    // Logged before the organisation was kept with it: the title alone, or as little as before.
    expect(said('role_changed', { from: { title: 'Intern' }, to: { title: 'Engineer' } })).toBe(
      'Role changed: Intern → Engineer',
    )
    expect(said('role_changed', { from: { title: null }, to: { title: null } })).toBe(
      'A role changed',
    )
  })

  it('says nothing of a change that is not news', () => {
    expect(said('field_changed', { field: 'gender', from: null, to: 'female' })).toBeUndefined()
    expect(said('something_new', {})).toBeUndefined()
  })
})

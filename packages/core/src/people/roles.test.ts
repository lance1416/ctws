import { describe, expect, it } from 'vitest'
import { currentRole } from './roles'

const role = (name: string, from: string | null, to: string | null = null) => ({ name, from, to })

describe('currentRole', () => {
  it('takes the current role that began first', () => {
    const roles = [
      role('Monzo', '2024-03'),
      role('Stripe', '2021-06'),
      role('Amazon', '2018-01', '2021-05'),
    ]
    expect(currentRole(roles)?.name).toBe('Stripe')
  })

  it('puts a role with no known start after those with one, then keeps the given order', () => {
    expect(currentRole([role('A', null), role('B', '2020-01')])?.name).toBe('B')
    expect(currentRole([role('A', null), role('B', null)])?.name).toBe('A')
  })

  it('is null when every role has ended', () => {
    expect(currentRole([role('Amazon', '2018-01', '2021-05')])).toBeNull()
    expect(currentRole([])).toBeNull()
  })
})

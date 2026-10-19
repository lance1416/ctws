import { describe, expect, it } from 'vitest'
import { candidatesQuery } from './link'

const id = '0190a7c2-6f00-7000-8000-000000000001'

describe('candidatesQuery', () => {
  it('names the thing being related from, and may narrow to some kinds', () => {
    const parsed = candidatesQuery.parse({
      view: 'candidates',
      type: 'task',
      id,
      q: 'stripe',
      kinds: 'person,organisation',
    })
    expect(parsed.kinds).toEqual(['person', 'organisation'])
  })

  it('refuses a kind it does not know', () => {
    expect(
      candidatesQuery.safeParse({ view: 'candidates', type: 'task', id, kinds: 'gossip' }).success,
    ).toBe(false)
  })
})

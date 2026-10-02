// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'

// Fixed non-UTC zone (+05:30, no DST), so the tests prove something on a UTC CI host too.
beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata'
})

const load = () => import('./components/TaskDetail')

describe('due time conversion', () => {
  it('reads a local wall-clock value as the matching instant', async () => {
    const { fromLocalInput } = await load()
    // 02:30 on the 3rd in +05:30 is 21:00 UTC on the 2nd.
    expect(fromLocalInput('2026-10-03T02:30')).toBe('2026-10-02T21:00:00.000Z')
  })

  it('shows an instant as local wall-clock time', async () => {
    const { toLocalInput } = await load()
    expect(toLocalInput('2026-10-02T21:00:00.000Z')).toBe('2026-10-03T02:30')
  })

  it('maps empty to null and back to the empty string', async () => {
    const { fromLocalInput, toLocalInput } = await load()
    expect(fromLocalInput('')).toBeNull()
    expect(toLocalInput(null)).toBe('')
  })
})

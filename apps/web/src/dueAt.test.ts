// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'

// Fixed non-UTC zone (+05:30, no DST), so the tests prove something on a UTC CI host too.
beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata'
})

const load = () => import('./components/TaskDetail')
const loadLabel = () => import('./dueAt')

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

describe('overdue label', () => {
  it('counts local calendar days, not elapsed milliseconds', async () => {
    const { overdueLabel } = await loadLabel()
    // Due 23:30 on the 3rd (+05:30); it is 00:10 on the 4th. Forty minutes, but already a day late.
    expect(overdueLabel('2026-10-03T18:00:00.000Z', new Date('2026-10-03T18:40:00.000Z'))).toBe(
      '已逾 1 天',
    )
    expect(overdueLabel('2026-10-01T03:30:00.000Z', new Date('2026-10-04T10:00:00.000Z'))).toBe(
      '已逾 3 天',
    )
  })

  it('never says 0 days, and never prints the datetime-local format', async () => {
    const { overdueLabel } = await loadLabel()
    const label = overdueLabel('2026-10-03T03:00:00.000Z', new Date('2026-10-03T10:00:00.000Z'))
    expect(label).toBe('已逾 1 天')
    expect(label).not.toMatch(/T/)
  })
})

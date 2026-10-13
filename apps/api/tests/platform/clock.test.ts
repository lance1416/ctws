import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appWithUser, createProject, type Harness } from '../helpers/harness'

// Noon in New York on the day DST starts: the local day runs 05:00Z to 04:00Z next day.
const NOW = new Date('2026-03-08T16:00:00Z')
let ctx: Harness

beforeAll(async () => {
  ctx = await appWithUser('clock@example.com', {
    clock: () => NOW,
    timezone: 'America/New_York',
  })
  const projectId = await createProject(ctx, 'Clock')
  const due = {
    lastNight: '2026-03-08T04:30:00Z', // 23:30 EST on the 7th: overdue
    tonight: '2026-03-09T03:30:00Z', // 23:30 EDT on the 8th: today
    tomorrow: '2026-03-09T04:30:00Z', // 00:30 EDT on the 9th: not on Today
  }
  for (const [title, dueAt] of Object.entries(due)) {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: ctx.authed,
      payload: { projectId, title, dueAt },
    })
    expect(res.statusCode).toBe(201)
  }
})
afterAll(async () => {
  await ctx?.stop()
})

describe('the injected clock', () => {
  it('decides Today in the account zone', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/tasks/today',
      headers: ctx.authed,
    })
    const segments = Object.fromEntries(
      (res.json().tasks as { title: string; segment: string }[]).map((t) => [t.title, t.segment]),
    )
    expect(segments).toEqual({ lastNight: 'overdue', tonight: 'today' })
  })
})

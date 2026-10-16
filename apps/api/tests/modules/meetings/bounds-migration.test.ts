import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { migratedTo } from '../../helpers/db'

/**
 * SERIES GOT THEIR SPAN, so a read of a window can skip the ones that miss it. A fresh database
 * has no meetings when the columns arrive; only one that already holds them shows each was given a
 * span that contains every occurrence, overrides included.
 */
const stops: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop()
})

describe('the meeting bounds migration', () => {
  it('gives every existing series a span around all its occurrences', async () => {
    const at = await migratedTo('0025_links_id')
    stops.push(at.stop)

    const ws = randomUUID()
    const [once, forever, ended, counted] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    await at.db.execute(sql`insert into workspaces (id) values (${ws})`)
    await at.db.execute(sql`
      insert into meetings (id, workspace_id, title, starts_local, time_zone, duration_minutes, rrule)
      values
        (${once}, ${ws}, 'once', '2026-10-20T09:00', 'America/Toronto', 60, null),
        (${forever}, ${ws}, 'forever', '2026-10-20T09:00', 'America/Toronto', 60, 'FREQ=WEEKLY;BYDAY=TU'),
        (${ended}, ${ws}, 'ended', '2026-10-20T09:00', 'America/Toronto', 60,
          'FREQ=WEEKLY;BYDAY=TU;UNTIL=20261027T235959Z'),
        (${counted}, ${ws}, 'counted', '2026-10-20T09:00', 'America/Toronto', 60,
          'FREQ=WEEKLY;BYDAY=TU;COUNT=3')`)
    // The ended series' last week moved to a Thursday and runs long; its first moved a day early.
    await at.db.execute(sql`
      insert into meeting_exceptions (meeting_id, recurrence_id, cancelled, starts_local, duration_minutes)
      values
        (${ended}, '2026-10-20T09:00', false, '2026-10-19T08:00', null),
        (${ended}, '2026-10-27T09:00', false, '2026-11-05T09:00', 90)`)

    await at.migrateRest()

    const utc = (column: string) =>
      sql.raw(`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"')`)
    const rows = await at.db.execute(sql`
      select title, ${utc('first_starts_at')} as first, ${utc('last_ends_at')} as last
      from meetings order by title`)
    // The app's own span, a day wider each way: see the migration.
    expect(rows.rows).toEqual([
      { title: 'counted', first: '2026-10-19T13:00Z', last: null },
      { title: 'ended', first: '2026-10-18T12:00Z', last: '2026-11-06T15:30Z' },
      { title: 'forever', first: '2026-10-19T13:00Z', last: null },
      { title: 'once', first: '2026-10-19T13:00Z', last: '2026-10-21T14:00Z' },
    ])
  })
})

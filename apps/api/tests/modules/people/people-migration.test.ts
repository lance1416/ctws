import { randomUUID } from 'node:crypto'
import type { MeetingOccurrence, PersonResponse } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../../src/app'
import { apiModules } from '../../../src/modules'
import { parseEnv } from '../../../src/platform/config'
import { hashPassword } from '../../../src/shell/auth/password'
import { migratedTo } from '../../helpers/db'

/**
 * CONTACTS BECAME PEOPLE, AND NOTHING WRITTEN BEFORE THAT WAS LOST.
 *
 * The rename moved two tables, a column and the type name stored inside every link. A fresh
 * database has no rows when it runs, so the whole suite would stay green even if the migration
 * dropped every person: only a database that already holds people can show it. This one is
 * migrated to the last schema that said "contact", filled through that schema, then carried
 * across.
 */
const stops: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop()
})

describe('the people migration', () => {
  it('carries a person, their channels and both ends of their links across the rename', async () => {
    const at = await migratedTo('0019_contact_birthday_daymonth')
    stops.push(at.stop)
    const env = parseEnv({ DATABASE_URL: at.connectionString })
    const app = await buildApp({ env, db: at.db, modules: apiModules({}) })
    await app.ready()
    stops.unshift(() => app.close())

    // The account is written in that schema's own shape: today's registration writes today's.
    const ws = randomUUID()
    const user = randomUUID()
    const password = 'correct horse battery'
    await at.db.execute(sql`
      insert into users (id, email, password_hash, timezone)
      values (${user}, 'm@example.com', ${await hashPassword(password)}, 'UTC')`)
    await at.db.execute(sql`insert into workspaces (id, name) values (${ws}, 'w')`)
    await at.db.execute(sql`
      insert into workspace_members (workspace_id, user_id, role) values (${ws}, ${user}, 'owner')`)

    const person = randomUUID()
    const meeting = randomUUID()
    await at.db.execute(sql`
      insert into contacts (id, workspace_id, name, birthday_calendar, birthday_month, birthday_day)
      values (${person}, ${ws}, '妈妈', 'lunar', 9, 6)`)
    await at.db.execute(sql`
      insert into contact_channels (id, contact_id, kind, value, label, rank) values
        (${randomUUID()}, ${person}, 'phone', '+86 138 0013 8000', null, 0),
        (${randomUUID()}, ${person}, 'email', 'mum@example.com', 'home', 1)`)
    await at.db.execute(sql`
      insert into meetings (id, workspace_id, title, starts_local, time_zone, duration_minutes)
      values (${meeting}, ${ws}, 'Call home', '2026-10-12T20:00', 'America/Toronto', 30)`)
    // One link with the person at the far end and one with them at the near end.
    await at.db.execute(sql`
      insert into links (workspace_id, from_type, from_id, to_type, to_id, kind) values
        (${ws}, 'meeting', ${meeting}, 'contact', ${person}, 'attends'),
        (${ws}, 'contact', ${person}, 'meeting', ${meeting}, 'about')`)

    await at.migrateRest()

    const web = { 'x-ctws-client': 'web' }
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: web,
      payload: { email: 'm@example.com', password },
    })
    expect(login.statusCode, login.body).toBe(200)
    const authed = { ...web, cookie: String(login.headers['set-cookie']).split(';')[0]! }

    const listed = await app.inject({ method: 'GET', url: '/api/v1/people', headers: authed })
    expect(listed.statusCode, listed.body).toBe(200)
    const [read] = (listed.json() as { people: PersonResponse[] }).people
    expect(read?.id).toBe(person)
    expect(read?.name).toBe('妈妈')
    expect(read?.birthday).toMatchObject({ calendar: 'lunar', month: 9, day: 6 })
    expect(read?.channels.map((c) => [c.kind, c.value, c.label])).toEqual([
      ['phone', '+86 138 0013 8000', null],
      ['email', 'mum@example.com', 'home'],
    ])

    // Read from the meeting's end: the person is still who attended it (0038 moved the edge).
    const linked = await app.inject({
      method: 'GET',
      url: `/api/v1/meetings/${meeting}`,
      headers: authed,
    })
    expect(linked.statusCode, linked.body).toBe(200)
    expect((linked.json() as MeetingOccurrence).attendees.map((a) => a.id)).toContain(person)

    // The `about` edge became a relation (0030); the attendance a row of the meeting's (0038).
    const moved = await at.db.execute<{ n: number }>(sql`
      select count(*)::int as n from relations where from_type = 'person' and from_id = ${person}`)
    expect(moved.rows[0]).toEqual({ n: 1 })
    const attends = await at.db.execute<{ n: number }>(sql`
      select count(*)::int as n from meeting_attendees where person_id = ${person}`)
    expect(attends.rows[0]).toEqual({ n: 1 })

    // Postgres 18 names NOT NULL constraints too; none of them may keep the old name.
    const stale = await at.db.execute<{ conname: string }>(sql`
      select conname from pg_constraint
      where conrelid in ('people'::regclass, 'person_channels'::regclass)
        and conname like 'contact%'`)
    expect(stale.rows.map((r) => r.conname)).toEqual([])
  })
})

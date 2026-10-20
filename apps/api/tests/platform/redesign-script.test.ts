import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MigrationItem } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { parseFailAt, runRedesignMigration } from '../../src/shell/migration'
import { migratedTo } from '../helpers/db'
import { countOf, loadFixture } from '../helpers/fixtures'

/**
 * THE MOVE TO THE NEW LAYOUT, on the "before the redesign" data set (FR-090 to FR-099): the
 * schema migrations first, then the script, then every guess it was asked to make is checked.
 */
const stops: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop()
})

const NOW = new Date('2026-10-20T09:00:00.000Z')

/** A backups directory with one dump in it, as the compose `backup` service leaves it. */
function backupsDir(withDump = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'ctws-backups-'))
  if (withDump) {
    // An old dump from an earlier start, and the one the backup service made just now: the newest
    // is the one from before this start's schema migrations (BUG-013, BUG-014).
    writeFileSync(join(dir, '20261020T085900Z-pre-redesign.dump'), 'PGDMP fake')
    const later = join(dir, '20261020T091500Z-pre-redesign.dump')
    writeFileSync(later, 'PGDMP after the schema moved')
    const now = Date.now()
    utimesSync(join(dir, '20261020T085900Z-pre-redesign.dump'), now / 1000 - 600, now / 1000 - 600)
    utimesSync(later, now / 1000, now / 1000)
  }
  stops.push(async () => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** The first account's workspace: the one the fixture's "typical" rows belong to. */
const A = sql`(select id from workspaces order by id limit 1)`

async function moved(failAt?: string) {
  const at = await migratedTo('0027_workspace_members_user_idx')
  stops.push(at.stop)
  await loadFixture(at.db, 'pre-redesign')
  await at.migrateRest()
  const lines: string[] = []
  const run = () =>
    runRedesignMigration(at.db, {
      backupsDir: backupsDir(),
      failAt: parseFailAt(failAt),
      now: NOW,
      log: (l) => lines.push(l),
    })
  return { db: at.db, run, lines }
}

const one = async (db: Awaited<ReturnType<typeof moved>>['db'], q: ReturnType<typeof sql>) =>
  (await db.execute(q)).rows[0] as Record<string, unknown>

describe('the move, on the pre-redesign data', () => {
  it('splits names, builds organisations and roles, and reports every guess', async () => {
    const { db, run, lines } = await moved()
    const outcome = await run()
    expect(outcome.migrated).toHaveLength(2)
    expect(outcome.failed).toEqual([])
    // The log says which backup and how many of each (release.md step 4).
    expect(lines.some((l) => l.includes('20261020T091500Z-pre-redesign.dump'))).toBe(true)

    // Names (FR-095): a compound surname, a middle name, one word, a comma, a space inside.
    const names = await db.execute(sql`
      select name, given_name, middle_name, family_name from people
      where workspace_id = ${A} order by created_at`)
    expect(names.rows).toEqual([
      { name: '欧阳娜娜', given_name: '娜娜', middle_name: null, family_name: '欧阳' },
      { name: 'Mary Jane Watson', given_name: 'Mary', middle_name: 'Jane', family_name: 'Watson' },
      { name: 'Cher', given_name: 'Cher', middle_name: null, family_name: null },
      { name: 'Wendy Li', given_name: 'Wendy', middle_name: null, family_name: 'Li' },
      { name: '王磊', given_name: '磊', middle_name: null, family_name: '王' },
      { name: 'Ada Clarke', given_name: 'Ada', middle_name: null, family_name: 'Clarke' },
      { name: 'Ben Shaw', given_name: 'Ben', middle_name: null, family_name: 'Shaw' },
    ])

    // Organisations: Stripe and stripe are one; Stripe Inc. is another, suggested for a merge.
    const orgs = await db.execute(
      sql`select name from organisations where workspace_id = ${A} order by name`,
    )
    expect(orgs.rows.map((r) => (r as { name: string }).name)).toEqual([
      'Stripe',
      'Stripe Inc.',
      'Tencent',
    ])
    const roles = await db.execute(sql`
      select p.name, o.name as org, r.title from person_roles r
      join people p on p.id = r.person_id join organisations o on o.id = r.organisation_id
      where r.workspace_id = ${A} order by p.created_at`)
    expect(roles.rows).toEqual([
      { name: '欧阳娜娜', org: 'Stripe', title: 'Product manager' },
      { name: 'Mary Jane Watson', org: 'Stripe', title: 'Staff engineer' },
      { name: 'Wendy Li', org: 'Stripe Inc.', title: 'Recruiter' },
      { name: '王磊', org: 'Tencent', title: 'Engineer' },
    ])
    // A title with no company stays in the note (FR-095).
    expect(await one(db, sql`select note from people where name = 'Cher'`)).toEqual({
      note: 'Title: Singer',
    })

    // Circles: the three of the last release, first in the list; each person in theirs.
    const circles = await db.execute(sql`
      select c.name, count(pc.person_id)::int as n from circles c
      left join person_circles pc on pc.circle_id = c.id
      where c.workspace_id = ${A} group by c.name, c.rank order by c.rank`)
    expect(circles.rows).toEqual([
      { name: 'Family', n: 1 },
      { name: 'Friends', n: 2 },
      { name: 'Work', n: 4 },
    ])

    // Time zones: from the city; the account's (Europe/London) for Cher, who has none. The bare
    // "Cambridge" goes to the most populous one, the full label to its own (FR-099).
    const zones = await db.execute(sql`
      select name, time_zone, time_zone_source from people
      where workspace_id = ${A} order by created_at`)
    expect(zones.rows).toEqual([
      { name: '欧阳娜娜', time_zone: 'Asia/Shanghai', time_zone_source: 'city' },
      { name: 'Mary Jane Watson', time_zone: 'Europe/London', time_zone_source: 'city' },
      { name: 'Cher', time_zone: 'Europe/London', time_zone_source: 'manual' },
      { name: 'Wendy Li', time_zone: 'Asia/Shanghai', time_zone_source: 'city' },
      { name: '王磊', time_zone: 'Asia/Shanghai', time_zone_source: 'city' },
      { name: 'Ada Clarke', time_zone: 'Europe/London', time_zone_source: 'city' },
      { name: 'Ben Shaw', time_zone: 'America/New_York', time_zone_source: 'city' },
    ])

    // The report: every name, the merge suggestion, the title without a company, the no-city.
    const report = (await db.execute(sql`select items, counts from migration_reports`)).rows[0] as {
      items: MigrationItem[]
      counts: {
        before: Record<string, number>
        after: Record<string, number>
        moved: Record<string, number>
      }
    }
    const section = (s: string) => report.items.filter((i) => i.section === s)
    expect(section('names')).toHaveLength(7)
    expect(
      section('names')
        .filter((i) => i.attention)
        .map((i) => [i.was, i.why]),
    ).toEqual([
      ['Cher', 'One word'],
      ['Li, Wendy', 'Had a comma'],
      ['王 磊', 'Had a space'],
    ])
    expect(section('names').find((i) => i.was === '欧阳娜娜')).toMatchObject({
      why: 'Compound surname',
      attention: false,
    })
    expect(section('organisationsToMerge')).toHaveLength(1)
    expect(section('organisationsToMerge')[0]!.group!.map((g) => [g.name, g.people])).toEqual([
      ['Stripe', 2],
      ['Stripe Inc.', 1],
    ])
    expect(section('rolesWithoutCompany').map((i) => [i.title, i.was])).toEqual([
      ['Cher', 'Singer'],
    ])
    expect(section('peopleWithoutCity').map((i) => i.title)).toEqual(['Cher'])
    expect(section('citiesByName')).toMatchObject([
      { title: 'Ada Clarke', was: 'Cambridge', now: 'Cambridge, England, United Kingdom' },
    ])
  })

  it('settles parents, moves planned days down, and turns meeting notes into notes', async () => {
    const { db, run } = await moved()
    await run()

    // Amazon was set to In progress by hand; its children are all To do (FR-092).
    expect(await one(db, sql`select status from tasks where title = 'Amazon'`)).toEqual({
      status: 'todo',
    })
    // Redesign's children: Batch 2 (in_progress, from Tokens done + Shell in progress), Old idea
    // (backlog), Dropped idea (cancelled): in progress overall.
    expect(await one(db, sql`select status from tasks where title = 'Batch 2'`)).toEqual({
      status: 'in_progress',
    })
    expect(await one(db, sql`select status from tasks where title = 'Redesign'`)).toEqual({
      status: 'in_progress',
    })
    // Stripe's planned day moved down to the child that had none, and left the one that had.
    const planned = await db.execute(sql`
      select title, scheduled_on::text as day from tasks
      where title in ('Stripe', 'Phone screen prep', 'Send the take-home') order by title`)
    expect(planned.rows).toEqual([
      { title: 'Phone screen prep', day: '2026-10-21' },
      { title: 'Send the take-home', day: '2026-10-20' },
      { title: 'Stripe', day: null },
    ])
    const report = (
      await db.execute(sql`select items, counts from migration_reports where workspace_id = ${A}`)
    ).rows[0] as { items: MigrationItem[]; counts: { moved: Record<string, number> } }
    // Every parent whose stored status differs from what its children say, deepest first.
    expect(
      report.items.filter((i) => i.section === 'parentsStatus').map((i) => [i.title, i.was, i.now]),
    ).toEqual([
      ['Batch 2', 'todo', 'in_progress'],
      ['Amazon', 'in_progress', 'todo'],
      ['Redesign', 'todo', 'in_progress'],
    ])
    // ...and a parent whose leaves all had their own day loses it, which is reported too.
    expect(report.items.filter((i) => i.section === 'plannedDatesMoved')).toMatchObject([
      { title: 'Stripe', was: '2026-10-20', now: 'Moved down to Send the take-home' },
      {
        title: 'Literature review',
        was: '2026-10-25',
        now: 'Dropped: every subtask already had its own day',
      },
    ])
    expect(
      await one(
        db,
        sql`select scheduled_on::text as day from tasks where title = 'Literature review'`,
      ),
    ).toEqual({ day: null })

    // The series note is a note on the series; the URL place is the join link (FR-096).
    const note = await db.execute(sql`
      select n.body, n.anchor_type, n.occurrence_id, m.note as left_on_meeting
      from notes n join meetings m on m.id = n.anchor_id`)
    expect(note.rows).toEqual([
      {
        body: '# Standing agenda\n\n- Open PRs\n- Flaky tests\n',
        anchor_type: 'meeting',
        occurrence_id: null,
        left_on_meeting: null,
      },
    ])
    const places = await db.execute(
      sql`select title, location, join_url from meetings order by title`,
    )
    // Text plus a URL is not a whole URL: it stays a place.
    expect(places.rows).toEqual([
      { title: 'Flat viewing', location: 'Flat 3, 12 Mare Street, London E8', join_url: null },
      { title: 'Thesis check-in', location: 'Zoom: https://zoom.us/j/123456789', join_url: null },
      {
        title: 'rust-analyzer sync',
        location: null,
        join_url: 'https://meet.google.com/abc-defg-hij',
      },
    ])
    // Everything else: what went where, including the two soft-deleted things that became
    // tombstones and the two relations to them that went with them (FR-090, FR-094).
    expect(report.counts.moved).toMatchObject({
      meetingNotes: 1,
      belongs: 7,
      attends: 4,
      recommends: 2,
      extraRecommenders: 1,
      about: 4,
      'links.about.toDeleted': 2,
      deleted: 2,
    })
    const stones = await db.execute(
      sql`select object_type, title from tombstones where workspace_id = ${A} order by title`,
    )
    expect(stones.rows).toEqual([
      { object_type: 'task', title: 'Compare removal companies' },
      { object_type: 'person', title: 'Former Agent' },
    ])
    expect(await countOf(db, "people where name = 'Former Agent'")).toBe(0)
  })

  it('gives everything a Created at its own creation instant, once (FR-093)', async () => {
    const { db, run } = await moved()
    await run()
    const missing = await db.execute(sql`
      select 'person' as kind, count(*)::int as n from people p
        where not exists (select 1 from events e where e.object_type = 'person' and e.object_id = p.id and e.type = 'created')
      union all
      select 'meeting', count(*)::int from meetings m
        where not exists (select 1 from events e where e.object_type = 'meeting' and e.object_id = m.id and e.type = 'created')
      union all
      select 'project', count(*)::int from projects p
        where not exists (select 1 from events e where e.object_type = 'project' and e.object_id = p.id and e.type = 'created')`)
    expect(missing.rows.map((r) => (r as { n: number }).n)).toEqual([0, 0, 0])
    // At the thing's own instant, and never a second one for a task, which had its log already.
    const at = await db.execute(sql`
      select count(*)::int as n from events e join people p on p.id = e.object_id
      where e.type = 'created' and e.occurred_at = p.created_at`)
    expect(at.rows[0]).toEqual({ n: 8 })
    expect(await countOf(db, "events where object_type = 'task' and type = 'created'")).toBe(21)
    expect(await countOf(db, "events where type = 'migrated'")).toBe(0)
  })

  it('runs once: a second run moves nothing and changes nothing', async () => {
    const { db, run } = await moved()
    await run()
    const before = (await db.execute(sql`select items, counts, ran_at from migration_reports`)).rows
    const again = await run()
    expect(again.migrated).toEqual([])
    expect(
      (await db.execute(sql`select items, counts, ran_at from migration_reports`)).rows,
    ).toEqual(before)
    expect(await countOf(db, 'organisations')).toBe(4)
    expect(await countOf(db, 'person_roles')).toBe(5)
  })

  it('moves each account on its own: a Stripe each, a report each, nothing shared', async () => {
    const { db, run } = await moved()
    await run()
    const stripes = await db.execute(sql`
      select w.id = ${A} as first, count(*)::int as n from organisations o
      join workspaces w on w.id = o.workspace_id where o.name = 'Stripe' group by w.id order by 1 desc`)
    expect(stripes.rows).toEqual([
      { first: true, n: 1 },
      { first: false, n: 1 },
    ])
    expect(await countOf(db, 'migration_reports')).toBe(2)
    const reports = (
      await db.execute(sql`
        select workspace_id = ${A} as first, items from migration_reports order by 1 desc`)
    ).rows as { first: boolean; items: MigrationItem[] }[]
    expect(reports[0]!.items.some((i) => i.title === 'Nora Diaz')).toBe(false)
    expect(reports[1]!.items.map((i) => [i.section, i.title])).toEqual([['names', 'Nora Diaz']])
  })

  it('fails one account alone when told to, moves the other, and later moves only the one left', async () => {
    const { db, run } = await moved()
    const [b] = (await db.execute(sql`select id from workspaces order by id desc limit 1`))
      .rows as {
      id: string
    }[]
    const dir = backupsDir()
    await expect(
      runRedesignMigration(db, {
        backupsDir: dir,
        failAt: parseFailAt(`people:${b!.id}`),
        now: NOW,
        log: () => {},
      }),
    ).rejects.toThrow(/failed for 1 workspace/)
    // A is moved, with its report; B is as it was.
    expect(await countOf(db, 'migration_reports')).toBe(1)
    expect(await countOf(db, "organisations where name = 'Stripe'")).toBe(1)
    expect(await countOf(db, "people where name = 'Nora Diaz' and family_name is null")).toBe(1)
    // The variable gone, the run moves B and leaves A alone.
    const again = await run()
    expect(again.migrated).toHaveLength(1)
    expect(again.migrated[0]).toBe(b!.id)
    expect(await countOf(db, 'migration_reports')).toBe(2)
    expect(await countOf(db, "organisations where name = 'Stripe'")).toBe(2)
  })

  it('rolls the workspace back whole when a step fails, and leaves no report', async () => {
    const { db, run } = await moved('meetings')
    await expect(run()).rejects.toThrow(/MIGRATION_FAIL_AT=meetings/)
    expect(await countOf(db, 'migration_reports')).toBe(0)
    expect(await countOf(db, 'organisations')).toBe(0)
    expect(await countOf(db, 'person_roles')).toBe(0)
    expect(await one(db, sql`select name from people where name = 'Li, Wendy'`)).toEqual({
      name: 'Li, Wendy',
    })
    expect(await one(db, sql`select status from tasks where title = 'Amazon'`)).toEqual({
      status: 'in_progress',
    })
  })

  it('refuses to serve a workspace still in the old layout when no backups directory is set', async () => {
    const at = await migratedTo('0027_workspace_members_user_idx')
    stops.push(at.stop)
    await loadFixture(at.db, 'pre-redesign')
    await at.migrateRest()
    await expect(
      runRedesignMigration(at.db, { backupsDir: undefined, now: NOW, log: () => {} }),
    ).rejects.toThrow(/BACKUPS_DIR is not set/)
    expect(await countOf(at.db, 'migration_reports')).toBe(0)
    // Once every workspace is in the new layout, no directory is needed: a stack with no old
    // data starts as it always did.
    await at.db.execute(sql`update workspaces set moved_at = ${NOW}`)
    const nothing = await runRedesignMigration(at.db, {
      backupsDir: undefined,
      now: NOW,
      log: () => {},
    })
    expect(nothing.migrated).toEqual([])
  })

  it('rolls a workspace back when the counts do not add up, and says which', async () => {
    const { db, run } = await moved()
    // An edge to nothing: neither copied by 0038 nor explained by a tombstone.
    await db.execute(sql`
      insert into links (id, workspace_id, from_type, from_id, to_type, to_id, kind)
      select gen_random_uuid(), ${A}, 'person', (select id from people where name = 'Cher'),
             'project', gen_random_uuid(), 'belongs'`)
    await expect(run()).rejects.toThrow(/count mismatch in links.belongs/)
    const reports = await db.execute(sql`select workspace_id from migration_reports`)
    // The other workspace, whose counts add up, is moved; this one is as it was.
    expect(reports.rows).toHaveLength(1)
    expect(await countOf(db, "organisations where name = 'Tencent'")).toBe(0)
  })

  it('keeps the backup it chose first through a retry, and chooses anew after a rollback (BUG-014)', async () => {
    const { db } = await moved()
    const dir = backupsDir()
    const attempt = (failAt?: string) =>
      runRedesignMigration(db, {
        backupsDir: dir,
        failAt: parseFailAt(failAt),
        now: NOW,
        log: () => {},
      })
    await expect(attempt('meetings')).rejects.toThrow(/MIGRATION_FAIL_AT/)
    // The failed attempt remembered its backup; a newer dump appears before the retry.
    writeFileSync(join(dir, '20261020T093000Z-pre-redesign.dump'), 'PGDMP from the retry')
    await attempt()
    const refs = await db.execute(sql`select distinct backup_ref from migration_reports`)
    expect(refs.rows).toEqual([{ backup_ref: '20261020T091500Z-pre-redesign.dump' }])
    // A rollback restores a database that remembers nothing: the next release starts afresh.
    // (These rows have moved once already, so the run only has to choose and then refuse.)
    await db.execute(sql`delete from migration_reports`)
    await db.execute(sql`delete from migration_backup`)
    await db.execute(sql`update workspaces set moved_at = null`)
    await expect(attempt('count')).rejects.toThrow(/MIGRATION_FAIL_AT=count/)
    const chosen = await db.execute(sql`select backup_ref from migration_backup`)
    expect(chosen.rows).toEqual([{ backup_ref: '20261020T093000Z-pre-redesign.dump' }])
  })

  it('refuses to move anything without a backup to go back to', async () => {
    const at = await migratedTo('0027_workspace_members_user_idx')
    stops.push(at.stop)
    await loadFixture(at.db, 'pre-redesign')
    await at.migrateRest()
    await expect(
      runRedesignMigration(at.db, { backupsDir: backupsDir(false), now: NOW, log: () => {} }),
    ).rejects.toThrow(/No backup/)
    expect(await countOf(at.db, 'migration_reports')).toBe(0)
    expect(await countOf(at.db, 'organisations')).toBe(0)
  })
})

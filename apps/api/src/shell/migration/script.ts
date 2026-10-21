import type { MigrationItem, ObjectType, TaskStatus, WorkspaceId } from '@ctws/contracts'
import { derivedStatus, displayName, initialsOf, sortKey, splitName } from '@ctws/core'
import { eq, sql } from 'drizzle-orm'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import type { Db, Tx } from '../../platform/db/client'
import { rowsOf } from '../../platform/db/raw'
import { resolveCity } from '../cities'
import { migrationBackup, type MigrationCounts, migrationReports } from './tables'

/**
 * THE MOVE TO THE NEW LAYOUT (RFC-001 3.1, FR-090 to FR-099).
 *
 * Runs after the schema migrations and before the server listens: one transaction per workspace,
 * skipped once that workspace has a report. The schema migrations already copied rows that need
 * no judgement (task events, `about` links, the three kinds of edge); this script does what needs
 * one: splits names, makes organisations and roles, settles parents, turns meeting notes into
 * notes, buries what was soft-deleted, and writes the report of every guess it made.
 *
 * `failAt` names a step to fail in, for a rehearsal of the failure path: that workspace rolls
 * back whole, the rest are still attempted, and the run ends in an error so the server does not
 * start. `MIGRATION_FAIL_AT=<step>` fails every workspace there; `<step>:<workspace id>` only
 * that one, so a run with two workspaces can show one moved and the other rolled back.
 */

const MIGRATION_STEPS = [
  'backup',
  'count',
  'legacy-deleted',
  'projects',
  'organisations',
  'people',
  'tasks',
  'meetings',
  'edges',
  'created',
  'verify',
  'report',
] as const
type MigrationStep = (typeof MIGRATION_STEPS)[number]

/** Where to fail on purpose: a step, in every workspace or in one. */
export type FailAt = { step: MigrationStep; workspaceId?: string | undefined }

/** `MIGRATION_FAIL_AT` as the environment gives it: `<step>` or `<step>:<workspace id>`. */
export function parseFailAt(text: string | undefined): FailAt | undefined {
  if (text === undefined || text === '') return undefined
  const [step, workspaceId] = text.split(':', 2)
  if (!(MIGRATION_STEPS as readonly string[]).includes(step!)) {
    throw new Error(`MIGRATION_FAIL_AT must name one of ${MIGRATION_STEPS.join(', ')}`)
  }
  return { step: step as MigrationStep, workspaceId: workspaceId || undefined }
}

export type MigrationOptions = {
  /**
   * Where the `backup` service left its dump; the newest `*.dump` there is the backup of record.
   * Unset: fine while nothing is owed a move, a refusal as soon as something is.
   */
  backupsDir: string | undefined
  failAt?: FailAt | undefined
  now: Date
  log?: ((line: string) => void) | undefined
}

export type MigrationOutcome = {
  migrated: WorkspaceId[]
  skipped: WorkspaceId[]
  failed: { workspaceId: WorkspaceId; error: string }[]
}

class MigrationFailure extends Error {
  constructor(step: MigrationStep) {
    super(`MIGRATION_FAIL_AT=${step}: failed on purpose in the ${step} step`)
    this.name = 'MigrationFailure'
  }
}

const id = () => uuidv7()

/**
 * The backup of record, chosen once per release and remembered in the database: at the first
 * attempt it is the newest dump, the one the `backup` service made just before this start, from
 * before any schema migration ran. A retry reuses the remembered one, since every dump made since
 * is of a database already changed; a rollback restores a database that remembers nothing, so the
 * next release chooses afresh (BUG-013, BUG-014). No backup, no move (FR-090).
 */
async function backupOfRecord(
  db: Db,
  dir: string,
  now: Date,
): Promise<{ name: string; bytes: number }> {
  const [kept] = await db.select().from(migrationBackup).where(eq(migrationBackup.key, 'current'))
  if (kept) return { name: kept.backupRef, bytes: Number(kept.backupBytes) }
  let names: string[]
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.dump'))
  } catch {
    throw new Error(`No backup directory at ${dir}: refusing to migrate without a backup`)
  }
  if (names.length === 0) throw new Error(`No backup in ${dir}: refusing to migrate without one`)
  const newest = names
    .map((name) => ({ name, at: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at)[0]!
  const chosen = { name: newest.name, bytes: statSync(join(dir, newest.name)).size }
  await db.insert(migrationBackup).values({
    key: 'current',
    backupRef: chosen.name,
    backupBytes: String(chosen.bytes),
    chosenAt: now,
  })
  return chosen
}

export async function runRedesignMigration(
  db: Db,
  opts: MigrationOptions,
): Promise<MigrationOutcome> {
  const log = opts.log ?? ((line: string) => console.log(line))
  // Owed a move: made before the redesign (no `moved_at`) and not reported on yet.
  const workspaces = rowsOf(
    await db.execute(sql`
      select w.id from workspaces w
      where w.moved_at is null
        and not exists (select 1 from migration_reports r where r.workspace_id = w.id)
      order by w.id`),
    z.object({ id: z.string() }),
  ).map((r) => r.id as WorkspaceId)
  const outcome: MigrationOutcome = { migrated: [], skipped: [], failed: [] }
  if (workspaces.length === 0) {
    log('redesign migration: every workspace is in the new layout, nothing to do')
    return outcome
  }

  if (opts.backupsDir === undefined) {
    throw new Error(
      `${workspaces.length} workspace(s) still hold data in the old layout and BACKUPS_DIR is ` +
        'not set: refusing to serve them unmoved. Set BACKUPS_DIR to where the backup service ' +
        'leaves its dump (compose mounts it at /backups).',
    )
  }
  if (opts.failAt?.step === 'backup') throw new MigrationFailure('backup')
  const backup = await backupOfRecord(db, opts.backupsDir, opts.now)
  log(`redesign migration: backup of record ${backup.name} (${backup.bytes} bytes)`)

  for (const workspaceId of workspaces) {
    try {
      const counts = await db.transaction((tx) =>
        migrateWorkspace(tx, { workspaceId, backup, failAt: opts.failAt, now: opts.now }),
      )
      outcome.migrated.push(workspaceId)
      log(
        `redesign migration: workspace ${workspaceId} moved: ` +
          Object.entries(counts.after)
            .map(([k, n]) => `${k}=${n}`)
            .join(' ') +
          ' | moved ' +
          Object.entries(counts.moved)
            .map(([k, n]) => `${k}=${n}`)
            .join(' '),
      )
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      outcome.failed.push({ workspaceId, error })
      log(`redesign migration: workspace ${workspaceId} FAILED and rolled back: ${error}`)
    }
  }
  if (outcome.failed.length > 0) {
    throw new Error(
      `redesign migration failed for ${outcome.failed.length} workspace(s): ` +
        outcome.failed.map((f) => `${f.workspaceId} (${f.error})`).join('; '),
    )
  }
  return outcome
}

type Run = {
  workspaceId: WorkspaceId
  backup: { name: string; bytes: number }
  failAt: FailAt | undefined
  now: Date
}

/** The live row counts the report keeps, by table. */
const COUNTED = [
  'projects',
  'tasks',
  'task_dependencies',
  'people',
  'person_channels',
  'meetings',
  'meeting_exceptions',
  'reading_items',
] as const

async function countLive(tx: Tx, workspaceId: WorkspaceId): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const table of COUNTED) {
    const live = ['task_dependencies', 'person_channels', 'meeting_exceptions'].includes(table)
      ? ''
      : ' and deleted_at is null'
    const owner =
      table === 'task_dependencies'
        ? sql`exists (select 1 from tasks t where t.id = blocked_id and t.workspace_id = ${workspaceId} and t.deleted_at is null)`
        : table === 'person_channels'
          ? sql`exists (select 1 from people p where p.id = person_id and p.workspace_id = ${workspaceId} and p.deleted_at is null)`
          : table === 'meeting_exceptions'
            ? sql`exists (select 1 from meetings m where m.id = meeting_id and m.workspace_id = ${workspaceId} and m.deleted_at is null)`
            : sql`workspace_id = ${workspaceId}`
    const result = await tx.execute(
      sql`select count(*)::int as n from ${sql.raw(table)} where ${owner}${sql.raw(live)}`,
    )
    counts[table] = (result.rows[0] as { n: number }).n
  }
  const links = await tx.execute(sql`
    select kind, count(*)::int as n from links where workspace_id = ${workspaceId} group by kind`)
  for (const kind of ['belongs', 'attends', 'recommends']) counts[`links.${kind}`] = 0
  for (const r of links.rows as { kind: string; n: number }[]) counts[`links.${r.kind}`] = r.n
  // `about` became relations in 0030; they are the manual relations with nothing written on them.
  const about = await tx.execute(sql`
    select count(*)::int as n from relations
    where workspace_id = ${workspaceId} and origin = 'manual' and note is null`)
  counts['links.about'] = (about.rows[0] as { n: number }).n
  return counts
}

async function migrateWorkspace(tx: Tx, run: Run): Promise<MigrationCounts> {
  const { workspaceId, now } = run
  const items: MigrationItem[] = []
  const moved: Record<string, number> = {}
  const step = (s: MigrationStep) => {
    const f = run.failAt
    if (f && f.step === s && (f.workspaceId === undefined || f.workspaceId === workspaceId)) {
      throw new MigrationFailure(s)
    }
  }
  const add = (item: Omit<MigrationItem, 'checked'>) => items.push({ ...item, checked: false })

  // ---- count -------------------------------------------------------------------------------
  step('count')
  const before = await countLive(tx, workspaceId)

  // ---- legacy-deleted: what was soft-deleted becomes a tombstone, and goes (FR-090) ------------
  step('legacy-deleted')
  const buried = await buryLegacy(tx, workspaceId, now)
  moved.deleted = buried.buried
  // Edges whose one end is gone were never copied by 0038, and `about` relations to one went with
  // its tombstone just now; they are not lost, they are counted.
  moved.edgesToDeleted = await countDanglingEdges(tx, workspaceId)
  moved['links.about.toDeleted'] = buried.aboutDropped

  // ---- projects: the six slots become eight names, by hue; initials from the name (FR-091) ----
  step('projects')
  await moveProjects(tx, workspaceId, now, add)

  // ---- organisations: from the company text on people (FR-095) -----------------------------
  step('organisations')
  const orgOf = await makeOrganisations(tx, workspaceId, now, add)

  // ---- people: names, roles, circles, time zones (FR-095) ----------------------------------
  step('people')
  await movePeople(tx, workspaceId, now, orgOf, add)

  // ---- tasks: parents settle, planned days move down (FR-092) ------------------------------
  step('tasks')
  await settleParents(tx, workspaceId, now, add)

  // ---- meetings: the note becomes a note, a URL place becomes the join link (FR-096) -------
  step('meetings')
  moved.meetingNotes = await moveMeetingNotes(tx, workspaceId, now)

  // ---- edges: counted where 0038 put them (FR-094) ------------------------------------------
  step('edges')
  Object.assign(moved, await countMovedEdges(tx, workspaceId))

  // ---- created: every thing without a log gets its "Created" (FR-093) ----------------------
  step('created')
  moved.createdAdded = await backfillCreated(tx, workspaceId)

  // ---- verify: live rows before = rows after (what went elsewhere is in `moved`) -----------
  step('verify')
  const after = await countLive(tx, workspaceId)
  for (const table of COUNTED) {
    if (before[table] !== after[table]) {
      throw new Error(`count mismatch in ${table}: ${before[table]} before, ${after[table]} after`)
    }
  }
  const edgeChecks: [string, number][] = [
    ['links.belongs', moved.belongs!],
    ['links.attends', moved.attends!],
    ['links.recommends', moved.recommends! + moved.extraRecommenders!],
    ['links.about', moved.about!],
  ]
  for (const [kind, n] of edgeChecks) {
    if (before[kind]! - (moved[`${kind}.toDeleted`] ?? 0) !== n) {
      throw new Error(`count mismatch in ${kind}: ${before[kind]} before, ${n} moved`)
    }
  }

  // ---- report ------------------------------------------------------------------------------
  step('report')
  const counts: MigrationCounts = { before, after, moved }
  await tx.insert(migrationReports).values({
    workspaceId,
    ranAt: now,
    backupRef: run.backup.name,
    backupBytes: String(run.backup.bytes),
    counts,
    items,
  })
  await tx.execute(sql`update workspaces set moved_at = ${now} where id = ${workspaceId}`)
  return counts
}

// ---- legacy soft deletes ---------------------------------------------------------------------

const graveRow = z.object({
  type: z.string(),
  id: z.string(),
  title: z.string(),
  deletedAt: z.coerce.date(),
  place: z.unknown(),
})

/**
 * Rows the last release deleted softly, and the tasks of projects it deleted, become tombstones
 * with their name, their deletion instant and where they were; then the rows go, with their
 * events, relations and resources. Returns how many.
 */
async function buryLegacy(
  tx: Tx,
  workspaceId: WorkspaceId,
  now: Date,
): Promise<{ buried: number; aboutDropped: number }> {
  const result = await tx.execute(sql`
    with gone_projects as (
      select id from projects where workspace_id = ${workspaceId} and deleted_at is not null
    ),
    gone_tasks as (
      select t.id, t.title, coalesce(t.deleted_at, p.deleted_at) as deleted_at,
             t.project_id, p.name as project_name, t.parent_id
      from tasks t join projects p on p.id = t.project_id
      where t.workspace_id = ${workspaceId}
        and (t.deleted_at is not null or t.project_id in (select id from gone_projects))
    )
    select 'task' as type, id::text, title, deleted_at as "deletedAt",
           json_build_object(
             'projectId', project_id, 'projectName', project_name,
             'parentType', case when parent_id is null then null else 'task' end,
             'parentId', parent_id,
             'path', (
               with recursive up(id, parent_id, title, depth) as (
                 select a.id, a.parent_id, a.title, 1 from tasks a where a.id = gone_tasks.parent_id
                 union all
                 select a.id, a.parent_id, a.title, up.depth + 1 from tasks a join up on a.id = up.parent_id
               )
               select coalesce(json_agg(title order by depth desc), '[]'::json) from up
             )
           ) as place
    from gone_tasks
    union all
    select 'project', id::text, name, deleted_at,
           json_build_object('projectId', null, 'projectName', null, 'parentType', null,
                             'parentId', null, 'path', '[]'::json)
    from projects where workspace_id = ${workspaceId} and deleted_at is not null
    union all
    select 'person', id::text, name, deleted_at,
           json_build_object('projectId', null, 'projectName', null, 'parentType', null,
                             'parentId', null, 'path', '[]'::json)
    from people where workspace_id = ${workspaceId} and deleted_at is not null
    union all
    select 'meeting', m.id::text, m.title, m.deleted_at,
           json_build_object('projectId', m.project_id,
                             'projectName', (select name from projects p where p.id = m.project_id),
                             'parentType', null, 'parentId', null, 'path', '[]'::json)
    from meetings m where m.workspace_id = ${workspaceId} and m.deleted_at is not null
    union all
    select 'reading', r.id::text, coalesce(r.title, r.fetched_title, r.url, ''), r.deleted_at,
           json_build_object('projectId', r.project_id,
                             'projectName', (select name from projects p where p.id = r.project_id),
                             'parentType', null, 'parentId', null, 'path', '[]'::json)
    from reading_items r where r.workspace_id = ${workspaceId} and r.deleted_at is not null
  `)
  const graves = rowsOf(result, graveRow)
  if (graves.length === 0) return { buried: 0, aboutDropped: 0 }
  for (const g of graves) {
    await tx.execute(sql`
      insert into tombstones (workspace_id, object_type, object_id, title, deleted_at, place)
      values (${workspaceId}, ${g.type}, ${g.id}::uuid, ${g.title}, ${g.deletedAt}, ${JSON.stringify(g.place)}::jsonb)
      on conflict do nothing`)
  }
  const ends = sql.join(
    graves.map((g) => sql`(${g.type}, ${g.id}::uuid)`),
    sql`, `,
  )
  await tx.execute(sql`delete from events where (object_type, object_id) in (${ends})`)
  const dropped = await tx.execute(sql`
    delete from relations where (from_type, from_id) in (${ends}) or (to_type, to_id) in (${ends})
    returning origin, note`)
  const aboutDropped = (dropped.rows as { origin: string; note: string | null }[]).filter(
    (r) => r.origin === 'manual' && r.note === null,
  ).length
  await tx.execute(sql`delete from resources where (owner_type, owner_id) in (${ends})`)
  await tx.execute(sql`
    update notes set anchor_type = null, anchor_id = null, occurrence_id = null, updated_at = ${now}
    where (anchor_type, anchor_id) in (${ends})`)
  const idsOf = (type: string) =>
    sql.join(
      graves.filter((g) => g.type === type).map((g) => sql`${g.id}::uuid`),
      sql`, `,
    )
  const has = (type: string) => graves.some((g) => g.type === type)
  // Tasks first (a deleted project's tasks are among them), then what else is gone.
  if (has('task')) await tx.execute(sql`delete from tasks where id in (${idsOf('task')})`)
  if (has('project')) await tx.execute(sql`delete from projects where id in (${idsOf('project')})`)
  if (has('person')) {
    await tx.execute(
      sql`delete from communication_parties where party_type = 'person' and party_id in (${idsOf('person')})`,
    )
    await tx.execute(sql`delete from people where id in (${idsOf('person')})`)
  }
  if (has('meeting')) await tx.execute(sql`delete from meetings where id in (${idsOf('meeting')})`)
  if (has('reading')) {
    await tx.execute(sql`delete from reading_items where id in (${idsOf('reading')})`)
  }
  return { buried: graves.length, aboutDropped }
}

/** Edges in `links` with an end that is a tombstone now: not lost, counted (FR-090). */
async function countDanglingEdges(tx: Tx, workspaceId: WorkspaceId): Promise<number> {
  const result = await tx.execute(sql`
    select count(*)::int as n from links l
    where l.workspace_id = ${workspaceId} and (
      exists (select 1 from tombstones s where s.object_type = l.from_type and s.object_id = l.from_id)
      or exists (select 1 from tombstones s where s.object_type = l.to_type and s.object_id = l.to_id)
    )`)
  return (result.rows[0] as { n: number }).n
}

// ---- projects --------------------------------------------------------------------------------

/** The last release's six slots, each to the nearest of the eight hues (FR-091). */
const COLOUR_OF: Record<string, string> = {
  'project-1': 'blue',
  'project-2': 'amber',
  'project-3': 'green',
  'project-4': 'pink',
  'project-5': 'teal',
  'project-6': 'olive',
}

async function moveProjects(
  tx: Tx,
  workspaceId: WorkspaceId,
  now: Date,
  add: (item: Omit<MigrationItem, 'checked'>) => void,
): Promise<void> {
  const rows = rowsOf(
    await tx.execute(sql`
      select id::text, name, color, initials from projects
      where workspace_id = ${workspaceId} and deleted_at is null order by rank, id`),
    z.object({ id: z.string(), name: z.string(), color: z.string(), initials: z.string() }),
  )
  for (const p of rows) {
    const color = COLOUR_OF[p.color] ?? p.color
    const initials = p.initials === '' ? initialsOf(p.name) : p.initials
    await tx.execute(
      sql`update projects set color = ${color}, initials = ${initials} where id = ${p.id}::uuid`,
    )
    add({
      key: `project:${p.id}`,
      section: 'projectColours',
      type: 'project',
      id: p.id,
      title: p.name,
      was: p.color,
      now: `${color} ${initials}`,
      why: 'Colour by hue, initials from the name',
      attention: false,
    })
  }
  void now
}

// ---- organisations ---------------------------------------------------------------------------

/** The same company written the same way, give or take case and the spaces around it. */
const sameKey = (org: string) => org.trim().toLowerCase()

/** The same company written differently, as far as a machine can tell: a suggestion, not a merge. */
const similarKey = (org: string) =>
  sameKey(org)
    .replace(/[.,'’&()]/g, ' ')
    .replace(/\b(inc|incorporated|ltd|limited|llp|llc|plc|co|corp|corporation|gmbh|ag|sa)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

async function makeOrganisations(
  tx: Tx,
  workspaceId: WorkspaceId,
  now: Date,
  add: (item: Omit<MigrationItem, 'checked'>) => void,
): Promise<Map<string, string>> {
  const rows = rowsOf(
    await tx.execute(sql`
      select org, count(*)::int as people, min(created_at) as "firstAt"
      from people
      where workspace_id = ${workspaceId} and deleted_at is null and org is not null and btrim(org) <> ''
      group by org order by min(created_at)`),
    z.object({ org: z.string(), people: z.number(), firstAt: z.coerce.date() }),
  )
  // One organisation per key; its name is the first way it was written.
  const orgOf = new Map<string, string>()
  const made = new Map<string, { id: string; name: string; people: number }>()
  for (const r of rows) {
    const key = sameKey(r.org)
    let org = made.get(key)
    if (!org) {
      org = { id: id(), name: r.org.trim(), people: 0 }
      made.set(key, org)
      await tx.execute(sql`
        insert into organisations (id, workspace_id, name, created_at, updated_at)
        values (${org.id}::uuid, ${workspaceId}, ${org.name}, ${now}, ${now})`)
    }
    org.people += r.people
    orgOf.set(r.org, org.id)
  }
  // Groups that look like one company, for you to decide.
  const alike = new Map<string, { id: string; name: string; people: number }[]>()
  for (const [key, org] of made) {
    const k = similarKey(key)
    alike.set(k, [...(alike.get(k) ?? []), org])
  }
  const groups = [...alike.values()].filter((g) => g.length > 1)
  // ...and one that is a prefix of another ("Stripe" / "Stripe Payments").
  const names = [...made.values()]
  for (const a of names) {
    for (const b of names) {
      if (a === b || similarKey(a.name) === similarKey(b.name)) continue
      if (similarKey(b.name).startsWith(similarKey(a.name) + ' ')) {
        const found = groups.find((g) => g.includes(a) || g.includes(b))
        if (found) {
          for (const x of [a, b]) if (!found.includes(x)) found.push(x)
        } else groups.push([a, b])
      }
    }
  }
  for (const group of groups) {
    const keep = [...group].sort((a, b) => b.people - a.people || a.name.localeCompare(b.name))[0]!
    add({
      key: `merge:${group.map((g) => g.id).join('+')}`,
      section: 'organisationsToMerge',
      type: 'organisation',
      id: keep.id,
      title: group.map((g) => g.name).join(' / '),
      was: null,
      now: keep.name,
      why: 'Written differently',
      attention: true,
      group: group.map((g) => ({ id: g.id, name: g.name, people: g.people })),
    })
  }
  return orgOf
}

// ---- people ----------------------------------------------------------------------------------

const personRow = z.object({
  id: z.string(),
  name: z.string(),
  org: z.string().nullable(),
  title: z.string().nullable(),
  circle: z.string().nullable(),
  city: z.string().nullable(),
  cityKey: z.string().nullable(),
  note: z.string().nullable(),
})

const CIRCLES: Record<string, string> = { family: 'Family', friend: 'Friends', work: 'Work' }

async function movePeople(
  tx: Tx,
  workspaceId: WorkspaceId,
  now: Date,
  orgOf: Map<string, string>,
  add: (item: Omit<MigrationItem, 'checked'>) => void,
): Promise<void> {
  const accountZone = await accountTimeZone(tx, workspaceId)
  // The three circles the last release had, as the first three of the list (FR-095).
  const circleIds = new Map<string, string>()
  for (const [rank, [key, name]] of Object.entries(CIRCLES).entries()) {
    const [row] = (
      await tx.execute(sql`
        insert into circles (id, workspace_id, name, rank)
        values (${id()}::uuid, ${workspaceId}, ${name}, ${rank})
        on conflict (workspace_id, name) do update set rank = excluded.rank
        returning id`)
    ).rows as { id: string }[]
    circleIds.set(key, row!.id)
  }

  const people = rowsOf(
    await tx.execute(sql`
      select id::text, name, org, title, circle, city, city_key as "cityKey", note
      from people where workspace_id = ${workspaceId} and deleted_at is null
      order by created_at, id`),
    personRow,
  )
  for (const p of people) {
    // The name, in three parts.
    const { why, ...parts } = splitName(p.name)
    const shown = displayName(parts)
    const attention = why !== null && ['Had a comma', 'One word', 'Had a space'].includes(why)
    add({
      key: `name:${p.id}`,
      section: 'names',
      type: 'person',
      id: p.id,
      title: p.name,
      was: p.name,
      now: shown,
      why,
      attention,
    })

    // Company and title: one role now; a title alone stays in the note (FR-095).
    const orgId = p.org && p.org.trim() !== '' ? orgOf.get(p.org) : undefined
    let note = p.note
    if (orgId) {
      await tx.execute(sql`
        insert into person_roles (id, workspace_id, person_id, organisation_id, title, from_month, to_month, rank)
        values (${id()}::uuid, ${workspaceId}, ${p.id}::uuid, ${orgId}::uuid, ${p.title}, null, null, 0)`)
    } else if (p.title && p.title.trim() !== '') {
      note = note && note.trim() !== '' ? `${note}\n\nTitle: ${p.title}` : `Title: ${p.title}`
      add({
        key: `role:${p.id}`,
        section: 'rolesWithoutCompany',
        type: 'person',
        id: p.id,
        title: shown,
        was: p.title,
        now: 'Kept in the note',
        why: 'No company',
        attention: true,
      })
    }

    // The circle, as membership of one of the three.
    const circleId = p.circle ? circleIds.get(p.circle) : undefined
    if (circleId) {
      await tx.execute(sql`
        insert into person_circles (person_id, circle_id) values (${p.id}::uuid, ${circleId}::uuid)
        on conflict do nothing`)
    }

    // The time zone, from the city; the account's when there is none (FR-095).
    let timeZone: string | null = null
    let source: 'city' | 'manual' | null = null
    let cityKey = p.cityKey
    if (p.city && p.city.trim() !== '') {
      const city = resolveCity(p.cityKey, p.city)
      if (city) {
        timeZone = city.timeZone
        source = 'city'
        cityKey = city.key
        if (city.byNameOnly) {
          add({
            key: `city:${p.id}`,
            section: 'citiesByName',
            type: 'person',
            id: p.id,
            title: shown,
            was: p.city,
            now: city.label,
            why: 'Matched by name; the largest one was taken',
            attention: false,
          })
        }
      } else {
        timeZone = accountZone
        source = 'manual'
        add({
          key: `zone:${p.id}`,
          section: 'peopleWithoutCity',
          type: 'person',
          id: p.id,
          title: shown,
          was: p.city,
          now: accountZone,
          why: 'City not in the list',
          attention: true,
        })
      }
    } else {
      timeZone = accountZone
      source = 'manual'
      add({
        key: `zone:${p.id}`,
        section: 'peopleWithoutCity',
        type: 'person',
        id: p.id,
        title: shown,
        was: null,
        now: accountZone,
        why: 'No city',
        attention: true,
      })
    }

    await tx.execute(sql`
      update people set
        given_name = ${parts.givenName}, middle_name = ${parts.middleName},
        family_name = ${parts.familyName}, name = ${shown}, sort_key = ${sortKey(parts)},
        note = ${note}, time_zone = ${timeZone}, time_zone_source = ${source}, city_key = ${cityKey},
        updated_at = ${now}
      where id = ${p.id}::uuid`)
  }
}

/** The zone of the account that owns the workspace: its first member's. */
async function accountTimeZone(tx: Tx, workspaceId: WorkspaceId): Promise<string> {
  const result = await tx.execute(sql`
    select u.timezone from workspace_members m join users u on u.id = m.user_id
    where m.workspace_id = ${workspaceId} order by u.created_at, u.id limit 1`)
  const row = result.rows[0] as { timezone: string } | undefined
  return row?.timezone ?? 'UTC'
}

// ---- tasks -----------------------------------------------------------------------------------

const parentRow = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  scheduledOn: z.string().nullable(),
  depth: z.number().int(),
})

/**
 * Parents take their status from their children (FR-038), deepest first so each reads settled
 * children; the planned day a parent cannot keep moves down to the leaves under it that have none,
 * or is dropped and reported (FR-092).
 */
async function settleParents(
  tx: Tx,
  workspaceId: WorkspaceId,
  now: Date,
  add: (item: Omit<MigrationItem, 'checked'>) => void,
): Promise<void> {
  const parents = rowsOf(
    await tx.execute(sql`
      with recursive depth(id, d) as (
        select id, 0 from tasks where workspace_id = ${workspaceId} and parent_id is null
        union all
        select t.id, depth.d + 1 from tasks t join depth on t.parent_id = depth.id
      )
      select t.id::text, t.title, t.status, t.scheduled_on::text as "scheduledOn", depth.d as depth
      from tasks t join depth on depth.id = t.id
      where t.workspace_id = ${workspaceId} and t.deleted_at is null
        and exists (select 1 from tasks c where c.parent_id = t.id and c.deleted_at is null)
      order by depth.d desc, t.id`),
    parentRow,
  )
  for (const parent of parents) {
    const children = rowsOf(
      await tx.execute(
        sql`select status from tasks where parent_id = ${parent.id}::uuid and deleted_at is null`,
      ),
      z.object({ status: z.string() }),
    ).map((c) => c.status as TaskStatus)
    const derived = derivedStatus(children)
    if (derived !== null && derived !== parent.status) {
      await tx.execute(sql`
        update tasks set status = ${derived},
          completed_at = case when ${derived} = 'done' then coalesce(completed_at, ${now}) else null end,
          updated_at = ${now}
        where id = ${parent.id}::uuid`)
      add({
        key: `status:${parent.id}`,
        section: 'parentsStatus',
        type: 'task',
        id: parent.id,
        title: parent.title,
        was: parent.status,
        now: derived,
        why: 'Worked out from its subtasks',
        attention: true,
      })
    }
    if (parent.scheduledOn !== null) {
      const leaves = rowsOf(
        await tx.execute(sql`
          with recursive under(id) as (
            select id from tasks where parent_id = ${parent.id}::uuid and deleted_at is null
            union all
            select t.id from tasks t join under on t.parent_id = under.id where t.deleted_at is null
          )
          select t.id::text, t.title, t.scheduled_on::text as "scheduledOn" from tasks t
          join under on under.id = t.id
          where not exists (select 1 from tasks c where c.parent_id = t.id and c.deleted_at is null)`),
        z.object({ id: z.string(), title: z.string(), scheduledOn: z.string().nullable() }),
      )
      const bare = leaves.filter((l) => l.scheduledOn === null)
      if (bare.length > 0) {
        await tx.execute(sql`
          update tasks set scheduled_on = ${parent.scheduledOn}::date, updated_at = ${now}
          where id in (${sql.join(
            bare.map((l) => sql`${l.id}::uuid`),
            sql`, `,
          )})`)
      }
      await tx.execute(
        sql`update tasks set scheduled_on = null, updated_at = ${now} where id = ${parent.id}::uuid`,
      )
      add({
        key: `planned:${parent.id}`,
        section: 'plannedDatesMoved',
        type: 'task',
        id: parent.id,
        title: parent.title,
        was: parent.scheduledOn,
        now:
          bare.length > 0
            ? `Moved down to ${bare.map((l) => l.title).join(', ')}`
            : 'Dropped: every subtask already had its own day',
        why: 'A task with subtasks is planned by its subtasks',
        attention: false,
      })
    }
  }
}

// ---- meetings --------------------------------------------------------------------------------

const WHOLE_URL = /^https?:\/\/\S+$/i

async function moveMeetingNotes(tx: Tx, workspaceId: WorkspaceId, now: Date): Promise<number> {
  const meetings = rowsOf(
    await tx.execute(sql`
      select id::text, note, location, created_at as "createdAt" from meetings
      where workspace_id = ${workspaceId} and deleted_at is null
        and (note is not null or location is not null)`),
    z.object({
      id: z.string(),
      note: z.string().nullable(),
      location: z.string().nullable(),
      createdAt: z.coerce.date(),
    }),
  )
  let notes = 0
  for (const m of meetings) {
    if (m.note !== null && m.note.trim() !== '') {
      await tx.execute(sql`
        insert into notes (id, workspace_id, title, body, anchor_type, anchor_id, occurrence_id, created_at, updated_at)
        values (${id()}::uuid, ${workspaceId}, null, ${m.note}, 'meeting', ${m.id}::uuid, null, ${m.createdAt}, ${m.createdAt})`)
      notes += 1
    }
    const joinUrl =
      m.location !== null && WHOLE_URL.test(m.location.trim()) ? m.location.trim() : null
    await tx.execute(sql`
      update meetings set note = null,
        join_url = coalesce(join_url, ${joinUrl}),
        location = case when ${joinUrl}::text is null then location else null end,
        updated_at = ${now}
      where id = ${m.id}::uuid`)
  }
  return notes
}

// ---- edges -----------------------------------------------------------------------------------

async function countMovedEdges(tx: Tx, workspaceId: WorkspaceId): Promise<Record<string, number>> {
  const n = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)).rows[0] as { n: number }).n
  const belongs =
    (await n(
      sql`select count(*)::int as n from person_projects where workspace_id = ${workspaceId}`,
    )) +
    (await n(
      sql`select count(*)::int as n from meetings where workspace_id = ${workspaceId} and project_id is not null and deleted_at is null`,
    )) +
    (await n(
      sql`select count(*)::int as n from reading_items where workspace_id = ${workspaceId} and project_id is not null and deleted_at is null`,
    ))
  const attends = await n(sql`
    select count(*)::int as n from meeting_attendees a
    join meetings m on m.id = a.meeting_id where m.workspace_id = ${workspaceId}`)
  const recommends = await n(
    sql`select count(*)::int as n from reading_items where workspace_id = ${workspaceId} and recommended_by is not null and deleted_at is null`,
  )
  const extraRecommenders = await n(
    sql`select count(*)::int as n from relations where workspace_id = ${workspaceId} and origin = 'manual' and note = 'Also recommended it'`,
  )
  const about = await n(
    sql`select count(*)::int as n from relations where workspace_id = ${workspaceId} and origin = 'manual' and note is null`,
  )
  const result: Record<string, number> = { belongs, attends, recommends, extraRecommenders, about }
  // Edges to a tombstone, by kind, so the verification knows what never moved.
  const dangling = await tx.execute(sql`
    select l.kind, count(*)::int as n from links l
    where l.workspace_id = ${workspaceId} and (
      exists (select 1 from tombstones s where s.object_type = l.from_type and s.object_id = l.from_id)
      or exists (select 1 from tombstones s where s.object_type = l.to_type and s.object_id = l.to_id))
    group by l.kind`)
  for (const r of dangling.rows as { kind: string; n: number }[]) {
    result[`links.${r.kind}.toDeleted`] = r.n
  }
  return result
}

// ---- created ---------------------------------------------------------------------------------

const KINDS: { type: ObjectType; table: string; title: string }[] = [
  { type: 'project', table: 'projects', title: 'name' },
  { type: 'person', table: 'people', title: 'name' },
  { type: 'organisation', table: 'organisations', title: 'name' },
  { type: 'meeting', table: 'meetings', title: 'title' },
  { type: 'reading', table: 'reading_items', title: "coalesce(title, fetched_title, url, '')" },
  { type: 'note', table: 'notes', title: "coalesce(title, '')" },
]

/** A "Created" at its own creation instant for everything that has no log yet (FR-093). */
async function backfillCreated(tx: Tx, workspaceId: WorkspaceId): Promise<number> {
  let added = 0
  for (const kind of KINDS) {
    const live = ['projects', 'people', 'meetings', 'reading_items'].includes(kind.table)
      ? sql.raw(' and deleted_at is null')
      : sql.raw('')
    const result = await tx.execute(sql`
      insert into events (id, workspace_id, object_type, object_id, type, payload, occurred_at)
      select uuidv7(), ${workspaceId}, ${kind.type}, r.id, 'created',
             json_build_object('to', json_build_object('title', ${sql.raw(kind.title)}))::jsonb,
             r.created_at
      from ${sql.raw(kind.table)} r
      where r.workspace_id = ${workspaceId}${live}
        and not exists (
          select 1 from events e
          where e.object_type = ${kind.type} and e.object_id = r.id and e.type = 'created')
      returning id`)
    added += result.rows.length
  }
  return added
}

import type { LinkKind, ObjectType } from '@ctws/contracts'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Queryable } from '../db/client'
import { people, links, projects } from '../db/schema'

/**
 * EDGES -- the shell's own store, and the one way anything reaches anything else.
 *
 * A module knows only its own type and the types it may link to; it does not learn about the
 * others, because every one of these helpers names both ends.
 *
 * The literal table names below are deliberate: drizzle interpolates a column reference
 * UNQUALIFIED inside raw SQL, which inside a correlated subquery would bind to the outer row.
 * The reading and projects stores carry the same warning for the same reason.
 */

/** Where one object's edges hang: a type and an id, which is all either end ever is. */
export type Endpoint = { type: ObjectType; id: string }

/**
 * THE ONE PROJECT an object is filed under, as a pair of correlated subqueries.
 *
 * `links` permits many, and a module whose UI shows one picks the first by project rank rather
 * than an arbitrary row -- the same project every time, and the same one the project list puts
 * first. Both halves come from the same subquery, so an object never reports a project the person
 * cannot SEE: projects are soft-deleted, and a name nobody can navigate to is worse than none.
 */
export function oneProjectOf(type: ObjectType, table: string) {
  const pick = (column: 'id' | 'name') => sql`(
    select p.${sql.raw(column)} from links l
    join projects p on p.id = l.to_id
    where l.from_type = ${type} and l.from_id = ${sql.raw(`${table}.id`)}
      and l.to_type = 'project' and l.kind = 'belongs' and p.deleted_at is null
    order by p.rank, p.id limit 1
  )`
  return {
    projectId: pick('id') as ReturnType<typeof sql<string | null>>,
    projectName: pick('name') as ReturnType<typeof sql<string | null>>,
  }
}

/** Filed under one named project -- the filter behind `?projectId=`. */
export function filedUnder(type: ObjectType, table: string, projectId: string) {
  return sql`exists (
    select 1 from links l join projects p on p.id = l.to_id
    where l.from_type = ${type} and l.from_id = ${sql.raw(`${table}.id`)}
      and l.to_type = 'project' and l.kind = 'belongs'
      and p.id = ${projectId} and p.deleted_at is null
  )`
}

/**
 * UNFILED: under no project the person can still SEE.
 *
 * An object whose project was deleted reads as having none everywhere else, so it has to read
 * that way here too -- otherwise it would belong to no list at all.
 */
export function unfiled(type: ObjectType, table: string) {
  return sql`not exists (
    select 1 from links l join projects p on p.id = l.to_id
    where l.from_type = ${type} and l.from_id = ${sql.raw(`${table}.id`)}
      and l.to_type = 'project' and l.kind = 'belongs' and p.deleted_at is null
  )`
}

/**
 * REPLACES one kind of edge leaving one object, which is how every module writes relationships.
 *
 * Delete-then-insert rather than a diff: the caller always sends the whole set, the row count is
 * a handful, and a diff would be three statements where this is two. Runs inside the caller's
 * transaction, so a half-written set is not a state anything can observe.
 *
 * THE DELETE NAMES BOTH the far type and the kind. Dropping both is what `links.test.ts` catches:
 * a write of one relationship would take the object's others with it. Either one alone happens to
 * be enough for today's four kinds, because no two of them share a far type -- which is exactly
 * the kind of coincidence a fifth kind ends, so both stay.
 */
export async function putLinks(
  q: Queryable,
  workspaceId: string,
  from: Endpoint,
  toType: ObjectType,
  kind: LinkKind,
  toIds: readonly string[],
): Promise<void> {
  await q
    .delete(links)
    .where(
      and(
        eq(links.workspaceId, workspaceId),
        eq(links.fromType, from.type),
        eq(links.fromId, from.id),
        eq(links.toType, toType),
        eq(links.kind, kind),
      ),
    )
  const unique = [...new Set(toIds)]
  if (unique.length === 0) return
  await q.insert(links).values(
    unique.map((toId) => ({
      workspaceId,
      fromType: from.type,
      fromId: from.id,
      toType,
      toId,
      kind,
    })),
  )
}

/**
 * The projects a batch of objects are filed under, in ONE query for the whole page.
 *
 * Only projects that are still visible, for the reason `oneProjectOf` gives; ordered by rank, so
 * every list of them reads in the same order as the project list itself.
 */
export async function projectsLinkedFrom(
  q: Queryable,
  workspaceId: string,
  fromType: ObjectType,
  fromIds: readonly string[],
): Promise<Map<string, { id: string; name: string }[]>> {
  const by = new Map<string, { id: string; name: string }[]>()
  if (fromIds.length === 0) return by
  const rows = await q
    .select({ fromId: links.fromId, id: projects.id, name: projects.name })
    .from(links)
    .innerJoin(projects, eq(projects.id, links.toId))
    .where(
      and(
        eq(links.workspaceId, workspaceId),
        eq(links.fromType, fromType),
        inArray(links.fromId, [...fromIds]),
        eq(links.toType, 'project'),
        eq(links.kind, 'belongs'),
        isNull(projects.deletedAt),
      ),
    )
    .orderBy(asc(projects.rank), asc(projects.id))
  for (const row of rows) {
    const project = { id: row.id, name: row.name }
    const list = by.get(row.fromId)
    if (list) list.push(project)
    else by.set(row.fromId, [project])
  }
  return by
}

/**
 * The people a batch of objects point at, in ONE query for the whole page.
 *
 * A person deleted since the edge was made is left OUT rather than named: the address book is
 * where a name comes from, and a name nobody can look up is not one.
 */
export async function peopleLinkedFrom(
  q: Queryable,
  workspaceId: string,
  fromType: ObjectType,
  fromIds: readonly string[],
  kind: LinkKind,
): Promise<Map<string, { id: string; name: string }[]>> {
  const by = new Map<string, { id: string; name: string }[]>()
  if (fromIds.length === 0) return by
  const rows = await q
    .select({ fromId: links.fromId, id: people.id, name: people.name })
    .from(links)
    .innerJoin(people, eq(people.id, links.toId))
    .where(
      and(
        eq(links.workspaceId, workspaceId),
        eq(links.fromType, fromType),
        inArray(links.fromId, [...fromIds]),
        eq(links.toType, 'person'),
        eq(links.kind, kind),
        isNull(people.deletedAt),
      ),
    )
    .orderBy(asc(people.name), asc(people.id))
  for (const row of rows) {
    const person = { id: row.id, name: row.name }
    const list = by.get(row.fromId)
    if (list) list.push(person)
    else by.set(row.fromId, [person])
  }
  return by
}

/**
 * ADDS ONE EDGE. Already there is the state the caller asked for, so the conflict is ignored
 * rather than reported -- the primary key is the whole identity of an edge.
 */
export async function addLink(
  q: Queryable,
  workspaceId: string,
  from: Endpoint,
  to: Endpoint,
  kind: LinkKind,
): Promise<void> {
  await q
    .insert(links)
    .values({
      workspaceId,
      fromType: from.type,
      fromId: from.id,
      toType: to.type,
      toId: to.id,
      kind,
    })
    .onConflictDoNothing()
}

/** Removes one edge, named by both ends and the kind. Gone already is the same answer. */
export async function removeLink(
  q: Queryable,
  workspaceId: string,
  from: Endpoint,
  to: Endpoint,
  kind: LinkKind,
): Promise<void> {
  await q
    .delete(links)
    .where(
      and(
        eq(links.workspaceId, workspaceId),
        eq(links.fromType, from.type),
        eq(links.fromId, from.id),
        eq(links.toType, to.type),
        eq(links.toId, to.id),
        eq(links.kind, kind),
      ),
    )
}

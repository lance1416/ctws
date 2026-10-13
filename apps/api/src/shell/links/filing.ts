import type { ObjectType } from '@ctws/contracts'
import { and, asc, eq, getTableName, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { Queryable } from '../../platform/db/client'
import { ident } from '../../platform/db/sql'
import { projects } from '../projects/tables'
import { putLinks } from './store'
import { links } from './tables'

type Named = { id: string; name: string }

/** `l` is a `belongs` edge from the object `id` of `type` to a project. */
const belongsFrom = (type: ObjectType, id: SQL): SQL =>
  sql`l.from_type = ${type} and l.from_id = ${id} and l.to_type = 'project' and l.kind = 'belongs'`

/**
 * Where objects of one type are filed: their `belongs` edges to projects. Only visible projects
 * count, so an object whose project was deleted reads as unfiled everywhere.
 *
 * The correlated SQL names the table literally: drizzle renders a column unqualified, and inside
 * the subquery it would bind to the inner row.
 */
export function filing(type: ObjectType, table: PgTable & { id: AnyPgColumn }) {
  const id = sql`${ident(getTableName(table))}.id`
  const pick = (column: 'id' | 'name') => sql<string | null>`(
    select p.${ident(column)} from links l
    join projects p on p.id = l.to_id
    where ${belongsFrom(type, id)} and p.deleted_at is null
    order by p.rank, p.id limit 1
  )`
  return {
    /** The first visible project by rank, the same one on every surface. */
    project: { projectId: pick('id'), projectName: pick('name') },

    filedUnder: (projectId: string): SQL => sql`exists (
      select 1 from links l join projects p on p.id = l.to_id
      where ${belongsFrom(type, id)} and p.id = ${projectId} and p.deleted_at is null
    )`,

    unfiled: (): SQL => sql`not exists (
      select 1 from links l join projects p on p.id = l.to_id
      where ${belongsFrom(type, id)} and p.deleted_at is null
    )`,

    /** Replaces the object's projects, inside the caller's transaction. */
    put: (q: Queryable, workspaceId: string, objectId: string, projectIds: readonly string[]) =>
      putLinks(q, workspaceId, { type, id: objectId }, 'project', 'belongs', projectIds),
  }
}

/** The first visible project of `<alias>.id`, as a subquery for `left join lateral`. */
export function projectOfSql(type: ObjectType, alias: string): SQL {
  return sql`(
    select p.id, p.name from links l
    join projects p on p.id = l.to_id and p.deleted_at is null
    where ${belongsFrom(type, sql`${ident(alias)}.id`)}
    order by p.rank, p.id limit 1
  )`
}

/** The visible projects of a page of objects in one query, each list in project order. */
export async function projectsOf(
  q: Queryable,
  workspaceId: string,
  type: ObjectType,
  ids: readonly string[],
): Promise<Map<string, Named[]>> {
  const by = new Map<string, Named[]>()
  if (ids.length === 0) return by
  const rows = await q
    .select({ fromId: links.fromId, id: projects.id, name: projects.name })
    .from(links)
    .innerJoin(projects, eq(projects.id, links.toId))
    .where(
      and(
        eq(links.workspaceId, workspaceId),
        eq(links.fromType, type),
        inArray(links.fromId, [...ids]),
        eq(links.toType, 'project'),
        eq(links.kind, 'belongs'),
        isNull(projects.deletedAt),
      ),
    )
    .orderBy(asc(projects.rank), asc(projects.id))
  for (const { fromId, id, name } of rows) {
    const list = by.get(fromId)
    if (list) list.push({ id, name })
    else by.set(fromId, [{ id, name }])
  }
  return by
}

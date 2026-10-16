import { type ObjectType, type ProjectId, type WorkspaceId } from '@ctws/contracts'
import { asc, eq, getTableName, inArray, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { Queryable, Tx } from '../../platform/db/client'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { ident } from '../../platform/db/sql'
import { groupBy } from '../../platform/values'
import { projects } from '../projects/tables'
import { putLinks } from './store'
import { links } from './tables'

type Named = { id: ProjectId; name: string }

/**
 * `l` is a `belongs` edge from the object `<alias>.id` of `type` to the project `p`, all three in
 * the object's workspace.
 */
const belongsFrom = (type: ObjectType, alias: string): SQL => sql`
  l.from_type = ${type} and l.from_id = ${ident(alias)}.id
  and l.to_type = 'project' and l.kind = 'belongs'
  and l.workspace_id = ${ident(alias)}.workspace_id and p.workspace_id = l.workspace_id
`

/**
 * Where objects of one type are filed: their `belongs` edges to projects. Only visible projects
 * count, so an object whose project was deleted reads as unfiled everywhere.
 *
 * The correlated SQL names the table literally: drizzle renders a column unqualified, and inside
 * the subquery it would bind to the inner row.
 */
export function filing(
  type: ObjectType,
  table: PgTable & { id: AnyPgColumn; workspaceId: AnyPgColumn },
) {
  const name = getTableName(table)
  const pick = <T>(column: 'id' | 'name') => sql<T | null>`(
    select p.${ident(column)} from links l
    join projects p on p.id = l.to_id
    where ${belongsFrom(type, name)} and p.deleted_at is null
    order by p.rank, p.id limit 1
  )`
  return {
    /** The first visible project by rank, the same one on every surface. */
    project: { projectId: pick<ProjectId>('id'), projectName: pick<string>('name') },

    unfiled: (): SQL => sql`not exists (
      select 1 from links l join projects p on p.id = l.to_id
      where ${belongsFrom(type, name)} and p.deleted_at is null
    )`,

    /** Replaces the object's projects, inside the caller's transaction. */
    put: (
      q: Tx,
      {
        workspaceId,
        now,
        id,
        projectIds,
      }: Actor & { id: string; projectIds: readonly ProjectId[] },
    ) =>
      putLinks(q, {
        workspaceId,
        now,
        from: { type, id },
        toType: 'project',
        kind: 'belongs',
        toIds: projectIds,
      }),
  }
}

/** The first visible project of `<alias>.id`, as a subquery for `left join lateral`. */
export function projectOfSql(type: ObjectType, alias: string): SQL {
  return sql`(
    select p.id, p.name from links l
    join projects p on p.id = l.to_id and p.deleted_at is null
    where ${belongsFrom(type, alias)}
    order by p.rank, p.id limit 1
  )`
}

/** The visible projects of a page of objects in one query, each list in project order. */
export async function projectsOf(
  q: Queryable,
  workspaceId: WorkspaceId,
  type: ObjectType,
  ids: readonly string[],
): Promise<Map<string, Named[]>> {
  if (ids.length === 0) return new Map()
  const rows = await q
    .select({ fromId: links.fromId, id: projects.id, name: projects.name })
    .from(links)
    .innerJoin(projects, eq(projects.id, links.toId))
    .where(
      within(
        scoped(links, workspaceId),
        scoped(projects, workspaceId),
        eq(links.fromType, type),
        inArray(links.fromId, [...ids]),
        eq(links.toType, 'project'),
        eq(links.kind, 'belongs'),
      ),
    )
    .orderBy(asc(projects.rank), asc(projects.id))
  return groupBy(
    rows,
    (r) => r.fromId,
    ({ id, name }) => ({ id, name }),
  )
}

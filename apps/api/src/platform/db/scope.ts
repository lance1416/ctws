import type { WorkspaceId } from '@ctws/contracts'
import { and, getTableName, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import { ident } from './sql'

declare const confined: unique symbol

/**
 * What confines a query to one workspace's live rows. Only this file makes one, and `within` takes
 * a query's conditions only after one, so a read cannot leave its workspace out.
 */
export type Scope = SQL & { readonly [confined]: true }

/** A table that holds one workspace's rows; one with `deletedAt` deletes them softly. */
type Owned = PgTable & { workspaceId: AnyPgColumn; deletedAt?: AnyPgColumn }

const confine = (predicate: SQL): Scope => sql`(${predicate})` as Scope

/**
 * This workspace's rows of `table`, live ones only where the table deletes softly. `alias` is how
 * the query names the table; the query builder names it by its own name.
 */
export function scoped(table: Owned, workspaceId: WorkspaceId, alias = getTableName(table)): Scope {
  const at = (column: string) => sql`${ident(alias)}.${ident(column)}`
  return confine(
    'deletedAt' in table
      ? sql`${at('workspace_id')} = ${workspaceId} and ${at('deleted_at')} is null`
      : sql`${at('workspace_id')} = ${workspaceId}`,
  )
}

/** Live rows of the table under `alias` that hang off a row in `parent`, such as a task's project. */
export const liveUnder = (alias: string, parent: Scope): Scope =>
  confine(sql`${ident(alias)}.deleted_at is null and ${parent}`)

/** The scope and a query's own conditions, all of which must hold. */
export const within = (scope: Scope, ...conditions: (SQL | undefined)[]): SQL =>
  and(scope, ...conditions)!

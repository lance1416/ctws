import { type LinkKind, type ObjectType, type WorkspaceId } from '@ctws/contracts'
import { asc, inArray, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { Queryable } from '../../platform/db/client'
import { textMatches } from '../../platform/db/sql'

/**
 * How a module names its own objects for the shell, which owns the edges but not the tables at
 * either end of them.
 */
export type Linkable = {
  /** Which kind of object this names; exactly one module answers for each. */
  type: ObjectType
  /** The heading a group of these gets on an object page. */
  label: string
  /**
   * The module's objects by id or by text, in one batch. What the workspace cannot see is left
   * out, and the shell drops the edges that pointed at it.
   */
  rows: (q: Queryable, workspaceId: WorkspaceId, want: Want) => Promise<NamedRow[]>
  /**
   * Edges the module stores in its own columns rather than the edge table, by the kind of thing at
   * their far end, read for the object whose page is drawn and named as that kind names its own:
   * a task's project is a column.
   */
  own?: Partial<Record<ObjectType, OwnEdges>>
}

/**
 * These ids, at most `limit` of them by title, or a text match with the likely few first; empty
 * text asks for those alone.
 */
export type Want = { ids: readonly string[]; limit: number } | { text: string; limit: number }

/** One object as the shell shows it: a line and a phrase under it. */
type NamedRow = { id: string; title: string; detail: string | null }

/** An object page's thing, and the things at the far end of the edges a module keeps for it. */
type OwnEdges = (
  q: Queryable,
  workspaceId: WorkspaceId,
  of: { type: ObjectType; id: string },
  limit: number,
) => Promise<OwnEdge[]>

/** The far end of an edge a module keeps, named, and how the edge runs from the page's thing. */
type OwnEdge = NamedRow & { kind: LinkKind; outgoing: boolean }

/** A module's columns, as a `Want` reads them. */
type Columns = {
  id: AnyPgColumn
  /** What its rows are sorted by when they are asked for by id. */
  title: SQL | AnyPgColumn
  /** What a text match looks in, as `table.column`. */
  text: readonly string[]
}

/** By title, by code point as an object page lists them, then by id. */
export const byTitle = (title: SQL | AnyPgColumn, id: AnyPgColumn): SQL[] => [
  sql`${title} collate "C"`,
  asc(id),
]

/**
 * The where-clause, order and limit for a `Want`. By id the rows come `byTitle`; by text the
 * module's `likely` order puts the few most wanted first.
 */
export function wanted(
  want: Want,
  columns: Columns,
  likely: readonly SQL[],
): { where: SQL | undefined; orderBy: SQL[]; limit: number } {
  if ('ids' in want) {
    return {
      where: inArray(columns.id, [...want.ids]),
      orderBy: byTitle(columns.title, columns.id),
      limit: want.limit,
    }
  }
  return {
    where: want.text === '' ? undefined : textMatches(columns.text, want.text),
    orderBy: [...likely],
    limit: want.limit,
  }
}

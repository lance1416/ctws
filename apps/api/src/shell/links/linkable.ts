import type { LinkKind, ObjectType } from '@ctws/contracts'
import { inArray, type SQL } from 'drizzle-orm'
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
  rows: (q: Queryable, workspaceId: string, want: Want) => Promise<NamedRow[]>
  /**
   * Edges the module stores outside the edge table, for the object whose page is drawn: a task's
   * project is a column.
   */
  own?: (
    q: Queryable,
    workspaceId: string,
    of: { type: ObjectType; id: string },
  ) => Promise<StoredEdge[]>
}

/** These ids, or a text match; empty text asks for the most likely few. */
type Want = { ids: readonly string[] } | { text: string; limit: number }

/** One object as the shell shows it: a line and a phrase under it. */
type NamedRow = { id: string; title: string; detail: string | null }

/** An edge before its far end is named. */
export type StoredEdge = {
  fromType: ObjectType
  fromId: string
  toType: ObjectType
  toId: string
  kind: LinkKind
}

/** The where-clause and limit for a `Want` over a module's id column and text columns. */
export function wanted(
  want: Want,
  id: AnyPgColumn,
  text: readonly string[],
): { where: SQL | undefined; limit: number } {
  if ('ids' in want) return { where: inArray(id, [...want.ids]), limit: want.ids.length }
  return { where: want.text === '' ? undefined : textMatches(text, want.text), limit: want.limit }
}

import {
  type LinkCandidate,
  type NextAbout,
  type ObjectType,
  type ProjectId,
  type WorkspaceId,
} from '@ctws/contracts'
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
  /**
   * The module's objects by id or by text, in one batch, named with the facts their kind shows.
   * What the workspace cannot see is left out, and the shell drops the edges that pointed at it.
   */
  rows: (q: Queryable, workspaceId: WorkspaceId, want: Want) => Promise<LinkCandidate[]>
  /**
   * For a module with things still to come, its part of what comes next about each of these other
   * things, by their id (FR-058): a meeting's next occurrence, a reply's follow-up day. What is
   * related to a thing outright counts wherever it is filed; what is only inferred through a person
   * counts when it is filed under `projectId`. Things with nothing next are left out.
   */
  nextAbout?: (
    q: Queryable,
    workspaceId: WorkspaceId,
    about: readonly { type: ObjectType; id: string }[],
    at: NextAt,
  ) => Promise<Map<string, NextAbout>>
}

/** When, and from which project, what comes next is asked. */
export type NextAt = { now: Date; projectId: ProjectId }

/**
 * These ids, at most `limit` of them by title, or a text match with the likely few first; empty
 * text asks for those alone.
 */
export type Want = { ids: readonly string[]; limit: number } | { text: string; limit: number }

/** A module's columns, as a `Want` reads them. */
type Columns = {
  id: AnyPgColumn
  /** What its rows are sorted by when they are asked for by id. */
  title: SQL | AnyPgColumn
  /** What a text match looks in, as `table.column`. */
  text: readonly string[]
}

/** By title, by code point as an object page lists them, then by id. */
const byTitle = (title: SQL | AnyPgColumn, id: AnyPgColumn): SQL[] => [
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

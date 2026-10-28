import {
  type LastExchange,
  type LinkCandidate,
  type NextAbout,
  type ObjectType,
  type ProjectId,
  type ProjectStanding,
  type WorkspaceId,
} from '@ctws/contracts'
import { asc, inArray, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
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
  /** How many of them a text matches, as `rows` would find them all: search's totals (FR-024). */
  count: (q: Queryable, workspaceId: WorkspaceId, text: string) => Promise<number>
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
  /**
   * For a module whose things are exchanges with people, the latest of its own with each of these
   * people by their id, up to `now` (FR-060): a message, a meeting together. None, not a key.
   */
  lastAbout?: (
    q: Queryable,
    workspaceId: WorkspaceId,
    about: readonly string[],
    now: Date,
  ) => Promise<Map<string, LastExchange>>
  /**
   * For a module whose things sit in projects at a stage, where each of these other things stands:
   * by their id, a project each, through a thing of its own related to it (FR-064, FR-065), the
   * most recently staged first. None, not a key.
   */
  standingOf?: (
    q: Queryable,
    workspaceId: WorkspaceId,
    about: readonly string[],
  ) => Promise<Map<string, ProjectStanding[]>>
}

/** When, and from which project, what comes next is asked. */
export type NextAt = { now: Date; projectId: ProjectId }

/**
 * These ids, at most `limit` of them by title, or a text match with the likely few first; empty
 * text asks for those alone.
 */
export type Want =
  { ids: readonly string[]; limit: number } | { text: string; limit: number; offset?: number }

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
): { where: SQL | undefined; orderBy: SQL[]; limit: number; offset: number } {
  if ('ids' in want) {
    return {
      where: inArray(columns.id, [...want.ids]),
      orderBy: byTitle(columns.title, columns.id),
      limit: want.limit,
      offset: 0,
    }
  }
  return {
    where: matching(columns.text, want.text),
    orderBy: [...likely],
    limit: want.limit,
    offset: want.offset ?? 0,
  }
}

/** What a text matches in these columns: everything for no text. `count` and `rows` share it. */
export const matching = (text: readonly string[], words: string): SQL | undefined =>
  words === '' ? undefined : textMatches(text, words)

/** How many rows of `from` meet `where`: a kind's total for search (FR-024). */
export async function countWhere(
  q: Queryable,
  from: PgTable,
  where: SQL | undefined,
): Promise<number> {
  const [row] = await q
    .select({ n: sql<number>`count(*)::int` })
    .from(from)
    .where(where)
  return row?.n ?? 0
}

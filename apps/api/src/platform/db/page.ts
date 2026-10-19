import type { PageInfo } from '@ctws/contracts'
import { sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { DomainError } from '../errors'

/** A page asked for: at most `limit` rows, from where `cursor` says. */
export type PageAsked = { limit: number; cursor?: string | undefined }

/** One page of rows and what it says about itself. */
export type Page<T> = { rows: T[]; page: PageInfo }

/** A cursor handed back that this list never gave out. */
class NotACursor extends DomainError {
  constructor() {
    super('invalid', { detail: 'not a cursor this list gave out' })
  }
}

/**
 * How a list query reads one page: `limit` is one more row than the page holds, so whether there
 * is a next page is known without counting. The cursor is the offset where the page starts, which
 * serves a list that is ordered by something fixed, such as a name: a row added or removed while
 * the reader scrolls lands anywhere, and no cursor can do better than an offset.
 */
export function spanOf(asked: PageAsked): { limit: number; offset: number } {
  if (asked.cursor !== undefined && !/^\d{1,9}$/.test(asked.cursor)) throw new NotACursor()
  return { limit: asked.limit + 1, offset: asked.cursor ? Number(asked.cursor) : 0 }
}

/** The page among `rows`, which a query read with `spanOf(asked)`. */
export function pageOf<T>(rows: T[], asked: PageAsked): Page<T> {
  const { offset } = spanOf(asked)
  const more = rows.length > asked.limit
  return {
    rows: more ? rows.slice(0, asked.limit) : rows,
    page: { limit: asked.limit, nextCursor: more ? String(offset + asked.limit) : null },
  }
}

/** A row's own place in a newest-first order: its instant, and its id among those at it. */
type Keyed = { at: Date; id: string }

const KEYED = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([0-9a-f-]{36})$/

/**
 * How a newest-first list reads one page: the cursor is the last row shown, and the page is what
 * sorts after it. A list that grows at its head (what was said, written or finished most recently)
 * would show a row twice or skip one under an offset as soon as something new arrived.
 */
export function keyedSpan(
  asked: PageAsked,
  columns: { at: AnyPgColumn; id: AnyPgColumn },
): { limit: number; after: SQL | undefined } {
  if (asked.cursor === undefined) return { limit: asked.limit + 1, after: undefined }
  const m = KEYED.exec(asked.cursor)
  if (!m) throw new NotACursor()
  return {
    limit: asked.limit + 1,
    after: sql`(${columns.at}, ${columns.id}) < (${new Date(m[1]!)}, ${m[2]!})`,
  }
}

/** The page among `rows`, which a query read with `keyedSpan(asked)`, newest first. */
export function keyedPageOf<T>(rows: T[], asked: PageAsked, keyOf: (row: T) => Keyed): Page<T> {
  const more = rows.length > asked.limit
  const page = more ? rows.slice(0, asked.limit) : rows
  const last = page[page.length - 1]
  return {
    rows: page,
    page: {
      limit: asked.limit,
      nextCursor: more && last ? `${keyOf(last).at.toISOString()}|${keyOf(last).id}` : null,
    },
  }
}

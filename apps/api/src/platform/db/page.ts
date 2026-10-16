import type { PageInfo } from '@ctws/contracts'

/** A page asked for: at most `limit` rows, from where `cursor` says. */
export type PageAsked = { limit: number; cursor?: string | undefined }

/** One page of rows and what it says about itself. */
export type Page<T> = { rows: T[]; page: PageInfo }

/**
 * How a list query reads one page: `limit` is one more row than the page holds, so whether there
 * is a next page is known without counting. A cursor is the offset where the page starts; the
 * contract only promises it is opaque, so it can become a key without callers changing.
 */
export function spanOf(asked: PageAsked): { limit: number; offset: number } {
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

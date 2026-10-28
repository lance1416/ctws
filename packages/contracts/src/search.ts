import { z } from 'zod'
import { linkCandidate } from './link'
import { objectType } from './object'
import { pageInfo, pageQuery } from './page'

/** Matches one search page holds at most; a search is retyped rather than scrolled. */
export const SEARCH_LIMIT = 50

/** One box feeds every module, so the bound is shared. Blank would match every row. */
const searchText = z.string().trim().min(1).max(200)

/** A search of one collection, `?q=`, a page of `fallback` matches unless it asks for another. */
export const searchQueryOf = (fallback: number) =>
  z.object({ q: searchText, ...pageQuery(SEARCH_LIMIT, fallback) }).strict()

/** "All" shows this many of each kind; the rest are a tab away (FR-024). */
export const SEARCH_GROUP = 5

/**
 * Everything at once (`GET /search`, FR-024): every kind's first few and how many there are; or,
 * with `kind`, that kind alone a page at a time. Empty text is every row, most likely first.
 */
export const searchEverythingQuery = z
  .object({
    q: z.string().trim().max(200),
    kind: objectType.optional(),
    ...pageQuery(SEARCH_LIMIT, 30),
  })
  .strict()

export const searchEverythingResponse = z.object({
  /** Kind by kind, in the fixed order (DES-001), each with its total; a kind with none left out. */
  groups: z.array(
    z.object({ type: objectType, total: z.number().int(), items: z.array(linkCandidate) }),
  ),
  /** With `kind`, where its next page starts. */
  page: pageInfo.nullable(),
})
export type SearchEverythingResponse = z.infer<typeof searchEverythingResponse>

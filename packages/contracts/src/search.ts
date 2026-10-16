import { z } from 'zod'
import { pageQuery } from './page'

/** Matches one search page holds at most; a search is retyped rather than scrolled. */
export const SEARCH_LIMIT = 50

/** One box feeds every module, so the bound is shared. Blank would match every row. */
const searchText = z.string().trim().min(1).max(200)

/** A search of one collection, `?q=`, a page of `fallback` matches unless it asks for another. */
export const searchQueryOf = (fallback: number) =>
  z.object({ q: searchText, ...pageQuery(SEARCH_LIMIT, fallback) }).strict()

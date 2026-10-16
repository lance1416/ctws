import { z } from 'zod'

/**
 * Where a list's next page starts. Opaque to callers: they hand back what `nextCursor` said and
 * never build one.
 */
const pageCursor = z.string().regex(/^\d{1,9}$/, 'not a cursor this list gave out')

/**
 * The paging half of a list's query: at most `max` rows, `fallback` when no limit is asked for,
 * starting where `cursor` says.
 */
export const pageQuery = (max: number, fallback: number = max) => ({
  limit: z.coerce.number().int().min(1).max(max).default(fallback),
  cursor: pageCursor.optional(),
})

/** What a page says about itself: the limit it was cut at, and the cursor of the next, if any. */
export const pageInfo = z
  .object({ limit: z.number().int().positive(), nextCursor: pageCursor.nullable() })
  .strict()
export type PageInfo = z.infer<typeof pageInfo>

/** A full list is read a page at a time; this is the most one page of it holds. */
export const LIST_PAGE = 200

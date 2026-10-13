import { z } from 'zod'

/** One box feeds every module, so the bound is shared. Blank would match every row. */
export const searchQuery = z.object({ q: z.string().trim().min(1).max(200) }).strict()

/** Task matches per query; a search is retyped rather than scrolled. */
export const SEARCH_LIMIT = 50
